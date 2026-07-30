/**
 * Author-facing "someone commented on your suggestion" alerts.
 *
 * The messageCounts listeners already track the latest message timestamp per
 * option; this module watches those timestamps for options the current user
 * authored and plays a soft beep when a new comment lands while the app is
 * visible. The visual side (the distinct badge on the author's own card) is
 * derived directly in SolutionCard from `creatorId` + unread count — this
 * module only owns the sound and the "have I seen this timestamp" state.
 *
 * Deliberately imports nothing from store.ts/messageCounts.ts — both call
 * into it, so keeping it leaf-shaped avoids import cycles.
 */

import m from 'mithril';

const BEEP_THROTTLE_MS = 4000;
const MUTE_STORAGE_KEY = 'freedi_join_comment_beep';

let myOptionIds: Set<string> = new Set();
// Latest message timestamp we've already accounted for, per option. A first
// sighting only records (absorbing the initial snapshot after page load or a
// listener rebuild) — only a later increase can beep.
let lastSeenLatest: Map<string, number> = new Map();
let lastBeepAt = 0;

export interface BeepDecisionInput {
	isMine: boolean;
	prevLatest: number | undefined;
	latestTs: number;
	visible: boolean;
	isViewingOption: boolean;
	now: number;
	lastBeepAt: number;
	muted: boolean;
}

/**
 * Pure beep decision — exported for tests. A beep requires: the option is
 * mine, we had already recorded an earlier latest-timestamp (first sighting
 * absorbs initial snapshots), the timestamp actually advanced, the tab is
 * visible, the author isn't already reading that thread (which also covers
 * their own sends), the global throttle has elapsed, and sound isn't muted.
 */
export function shouldBeep(input: BeepDecisionInput): boolean {
	if (!input.isMine) return false;
	if (input.prevLatest === undefined) return false;
	if (input.latestTs <= input.prevLatest) return false;
	if (!input.visible) return false;
	if (input.isViewingOption) return false;
	if (input.now - input.lastBeepAt < BEEP_THROTTLE_MS) return false;
	if (input.muted) return false;

	return true;
}

/** Options the current user authored — refreshed from every options snapshot. */
export function setMyOptionIds(ids: string[]): void {
	myOptionIds = new Set(ids);
}

/**
 * Forget all seen timestamps. Called when the messageCounts subscription set
 * is rebuilt, so the fresh initial snapshots record silently instead of
 * beeping for history.
 */
export function resetAuthorAlerts(): void {
	lastSeenLatest = new Map();
	lastBeepAt = 0;
}

/**
 * Feed one option's latest message timestamp from a messageCounts snapshot.
 * Decides whether this delivery represents a fresh comment worth a beep.
 */
export function notifyLatestMessage(optionId: string, latestTs: number): void {
	const prevLatest = lastSeenLatest.get(optionId);
	lastSeenLatest.set(optionId, Math.max(latestTs, prevLatest ?? 0));

	const now = Date.now();
	const beep = shouldBeep({
		isMine: myOptionIds.has(optionId),
		prevLatest,
		latestTs,
		visible: typeof document !== 'undefined' && document.visibilityState === 'visible',
		isViewingOption: getCurrentChatSid() === optionId,
		now,
		lastBeepAt,
		muted: isBeepMuted(),
	});

	if (beep) {
		lastBeepAt = now;
		playCommentBeep();
	}
}

function getCurrentChatSid(): string | undefined {
	try {
		return m.route.param('sid') || undefined;
	} catch {
		return undefined;
	}
}

function isBeepMuted(): boolean {
	try {
		if (localStorage.getItem(MUTE_STORAGE_KEY) === 'off') return true;
	} catch {
		/* localStorage unavailable — fall through to the media query */
	}
	try {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
	} catch {
		/* matchMedia unavailable (tests, old browsers) */
	}

	return false;
}

/** Two soft ascending notes — quieter and shorter than the celebration arpeggio. */
export function playCommentBeep(): void {
	try {
		const ctx = new AudioContext();

		const notes = [660, 880];
		notes.forEach((freq, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.type = 'sine';
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.09);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.15);

			osc.start(ctx.currentTime + i * 0.09);
			osc.stop(ctx.currentTime + i * 0.09 + 0.15);
		});
	} catch {
		/* audio not available */
	}
}
