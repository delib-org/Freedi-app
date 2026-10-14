/**
 * What the student's ballot says about itself — pure, so it is tested in node.
 *
 * Two small rules live here because the view needs them and neither depends on
 * the DOM: which ONE state the status chip shows, and how a list keeps its
 * order while a finger is on it.
 */

/** The single state the status chip names. One live region, one sentence. */
export type BallotStatus = 'idle' | 'saving' | 'voted' | 'failed' | 'closed';

export interface BallotStatusInput {
	/** The vote is over (or the player stepped back to it) */
	readOnly: boolean;
	/** The student's vote as displayed: the tap just made, until the server has it */
	hasVote: boolean;
	/** A write is in the air */
	saving: boolean;
	/** The last write gave up */
	failed: boolean;
}

/**
 * Closed outranks everything: a ballot nobody can change has no "saving" left
 * to report. A failure outranks a saving write (the retry is the news), and a
 * write in the air outranks "received" — the vote is not in until it lands.
 */
export function ballotStatus(input: BallotStatusInput): BallotStatus {
	if (input.readOnly) return 'closed';
	if (input.failed) return 'failed';
	if (input.saving) return 'saving';

	return input.hasVote ? 'voted' : 'idle';
}

/**
 * How long a lifted finger keeps the list where it was. A tap is pointerdown,
 * pointerup, THEN click — releasing the latch on pointerup could slide the row
 * out from under the click that belongs to it.
 */
export const REORDER_RESUME_MS = 250;

/** Rows slide over this long on a phone: slow enough to follow, too short to wait for */
export const REORDER_SLIDE_MS = 350;

/**
 * Put `ids` in the order of `frozen`; anything `frozen` has never seen goes
 * after, in the order it came. Rows the list lost simply drop out, so a frozen
 * order can never resurrect a candidate.
 */
export function followFrozenOrder<T extends { id: string }>(items: T[], frozen: string[]): T[] {
	const place = new Map<string, number>();
	frozen.forEach((id, index) => place.set(id, index));

	return items
		.map((item, position) => ({ item, position }))
		.sort((a, b) => {
			const pa = place.get(a.item.id);
			const pb = place.get(b.item.id);
			if (pa !== undefined && pb !== undefined) return pa - pb;
			if (pa !== undefined) return -1;
			if (pb !== undefined) return 1;

			return a.position - b.position;
		})
		.map((entry) => entry.item);
}
