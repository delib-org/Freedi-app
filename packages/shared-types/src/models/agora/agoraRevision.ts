import { AGORA_ANTI_GAMING, AGORA_POINTS } from './agoraConstants';

/**
 * The revision-event rules of the improvement loop, as pure functions so the
 * Cloud Function and the client narrate saves with the exact same arithmetic
 * (same doctrine as agoraBridging/agoraConsensus).
 *
 * A SAVE is not a REVISION. A save becomes a revision event only when the
 * text really changed (word delta gate), and rapid saves collapse into one
 * event (debounce). A revision event earns the credit only when NEW feedback
 * arrived since the last credited one — the credit pays for listening, never
 * for the keystroke.
 */

export interface AgoraRevisionInput {
	/** Proposal text before this save */
	prevText: string;
	/** Proposal text after this save */
	newText: string;
	/** Server time of this save (ms) */
	now: number;
	/** `editedAt` of the newest editHistory entry; absent before the first event */
	lastEventAt?: number;
	/** Revisions already credited on this proposal */
	creditedRevisions: number;
	/** Student raters on this proposal right now (Σ studentDist across camps) */
	studentRatingsNow: number;
	/** Student-rater tally when a revision was last credited; absent = never credited */
	studentRatingsAtCredit?: number;
	/** When the owner last thanked a helper on this proposal */
	lastThankAt?: number;
	/** When a revision credit was last paid */
	lastCreditAt?: number;
}

export interface AgoraRevisionAssessment {
	/** Words changed vs the previous text (added + removed) */
	changedWords: number;
	/** The text really changed (delta ≥ MIN_REVISION_DELTA_WORDS) */
	realChange: boolean;
	/** Open a NEW editHistory entry (a real change outside the debounce window) */
	isNewEvent: boolean;
	/** A real change INSIDE the debounce window — refresh the newest entry's editedAt */
	mergeIntoLastEvent: boolean;
	/** New feedback (a student rating or a thank) arrived since the last credited revision */
	feedbackSinceCredit: boolean;
	/** Points to pay the author for this save (0 or REVISION_CREDIT) */
	credit: number;
	/** This is the FIRST credited revision — the one the client celebrates in full */
	isFirstCredit: boolean;
}

/** Normalized word tokens: whitespace-split, edge punctuation stripped, case-folded */
function tokens(text: string): string[] {
	return text
		.trim()
		.split(/\s+/)
		.map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase())
		.filter((w) => w.length > 0);
}

/**
 * Words changed between two texts: added + removed relative to their longest
 * common subsequence. Reordering counts (moved words are removed + added),
 * which is the honest reading — moving three sentences around IS editing.
 */
export function countChangedWords(before: string, after: string): number {
	const a = tokens(before);
	const b = tokens(after);
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	// LCS length, two-row DP. Proposals cap at 1500 chars (~300 tokens).
	let prev = new Array<number>(b.length + 1).fill(0);
	let curr = new Array<number>(b.length + 1).fill(0);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
		}
		[prev, curr] = [curr, prev];
	}
	const lcs = prev[b.length];

	return a.length - lcs + (b.length - lcs);
}

/**
 * Classify one save of the author's proposal. Pure — the caller supplies the
 * clocks and tallies, the function answers what kind of moment this is and
 * what it pays.
 */
export function assessRevision(input: AgoraRevisionInput): AgoraRevisionAssessment {
	const changedWords = countChangedWords(input.prevText, input.newText);
	const realChange = changedWords >= AGORA_ANTI_GAMING.MIN_REVISION_DELTA_WORDS;

	const outsideDebounce =
		input.lastEventAt === undefined ||
		input.now - input.lastEventAt >= AGORA_ANTI_GAMING.REVISION_DEBOUNCE_MS;
	const isNewEvent = realChange && outsideDebounce;
	const mergeIntoLastEvent = realChange && !outsideDebounce;

	const neverCredited = input.lastCreditAt === undefined;
	const feedbackSinceCredit = neverCredited
		? input.studentRatingsNow > 0 || input.lastThankAt !== undefined
		: input.studentRatingsNow > (input.studentRatingsAtCredit ?? 0) ||
			(input.lastThankAt ?? 0) > (input.lastCreditAt ?? 0);

	const underCap = input.creditedRevisions < AGORA_POINTS.MAX_REVISION_CREDITS;

	// Merged saves never pay — the event they extend already had its chance,
	// and feedback landing mid-polish keeps for the NEXT event.
	const credit = isNewEvent && feedbackSinceCredit && underCap ? AGORA_POINTS.REVISION_CREDIT : 0;

	return {
		changedWords,
		realChange,
		isNewEvent,
		mergeIntoLastEvent,
		feedbackSinceCredit,
		credit,
		isFirstCredit: credit > 0 && input.creditedRevisions === 0,
	};
}
