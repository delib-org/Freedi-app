import type { Statement } from '@freedi/shared-types';
import type { LiveDraft } from '@/lib/liveDrafts';

/**
 * Pure rules of live writing at the table (IA 17, UX): which broadcasts a phone
 * shows (tablemates only), the line's words, how long the line lingers, how a
 * vanished draft is called "sent" or "stopped", who is in the watch picker and
 * where focus goes when the watch view closes. No Firebase, no DOM.
 */

/** The line waits this long after the last writer ends, so a clear-and-retype does not flash it. */
export const LINE_HOLD_MS = 1500;
/** The collapse after the wait (matches `--dur-quick`); the line is gone once it is over. */
export const LINE_LEAVE_MS = 140;

export interface Writer {
	uid: string;
	name: string;
	text: string;
	lastUpdate: number;
}

/** The name of a writer: the table roster's (same as the chips), else the broadcast's own. */
export function writerName(
	uid: string,
	displayName: string,
	roster: readonly { uid: string; name: string }[],
	someone: string,
): string {
	const mate = roster.find((x) => x.uid === uid);
	if (mate && mate.name !== someone) return mate.name;

	return displayName;
}

/**
 * The tablemates who broadcast, in seating order (`memberUids`), never me. A draft
 * with no text is a pause, not a writer, unless `keepEmpty` (the watch view keeps
 * the one being watched while the box is empty).
 */
export function tablemateWriters(
	drafts: readonly LiveDraft[],
	memberUids: readonly string[],
	selfUid: string,
	nameOf: (uid: string, displayName: string) => string,
	keepEmpty = false,
): Writer[] {
	return drafts
		.filter(
			(d) =>
				d.userId !== selfUid &&
				memberUids.includes(d.userId) &&
				(keepEmpty || d.text.trim().length > 0),
		)
		.sort((a, b) => memberUids.indexOf(a.userId) - memberUids.indexOf(b.userId))
		.map((d) => ({
			uid: d.userId,
			name: nameOf(d.userId, d.displayName),
			text: d.text,
			lastUpdate: d.lastUpdate,
		}));
}

export interface LineLabel {
	key: 'answer.live_one' | 'answer.live_many';
	params: { name: string } | { count: number };
}

/** One writer is named; several are counted. */
export function liveLineLabel(writers: readonly Writer[]): LineLabel {
	if (writers.length === 1) return { key: 'answer.live_one', params: { name: writers[0].name } };

	return { key: 'answer.live_many', params: { count: writers.length } };
}

/**
 * "sent" when the feed holds a proposal by the writer updated at or after the draft's
 * last update, else "stopped" (unticked, left the box, stale, disconnected, moved table).
 */
export function resolveEnd(
	userId: string,
	draftLastUpdate: number,
	proposals: readonly Statement[],
): 'sent' | 'stopped' {
	const sent = proposals.some((p) => p.creatorId === userId && p.lastUpdate >= draftLastUpdate);

	return sent ? 'sent' : 'stopped';
}

/** The picker: the live writers plus the one being watched, in seating order; shown from two on. */
export function pickerUids(
	writers: readonly Writer[],
	watchedUid: string | null,
	memberUids: readonly string[],
): string[] {
	const uids = writers.map((w) => w.uid);
	if (watchedUid && !uids.includes(watchedUid)) uids.push(watchedUid);

	return uids.sort((a, b) => memberUids.indexOf(a) - memberUids.indexOf(b));
}

/** Where focus returns when the watch view closes: the line, or the strip's current pill. */
export function focusReturnTarget(lineInPage: boolean): 'line' | 'pill' {
	return lineInPage ? 'line' : 'pill';
}

export interface HeldLine {
	writers: Writer[];
	/** The last writer ended and the wait is over: the line is collapsing. */
	leaving: boolean;
}

/**
 * Keeps the line on screen for LINE_HOLD_MS after the last writer ends and then for
 * LINE_LEAVE_MS while it collapses. While writers exist the line shows them as they are.
 */
export class LineHold {
	private last: Writer[] = [];
	private emptySince: number | null = null;

	/** What the line shows at `now`, or null when it is gone. */
	view(writers: readonly Writer[], now: number): HeldLine | null {
		if (writers.length > 0) {
			this.last = [...writers];
			this.emptySince = null;

			return { writers: this.last, leaving: false };
		}
		if (this.last.length === 0) return null;
		if (this.emptySince === null) this.emptySince = now;
		const waited = now - this.emptySince;
		if (waited < LINE_HOLD_MS) return { writers: this.last, leaving: false };
		if (waited < LINE_HOLD_MS + LINE_LEAVE_MS) return { writers: this.last, leaving: true };
		this.last = [];
		this.emptySince = null;

		return null;
	}

	/** The next moment (epoch ms) the line changes by itself, or null when it is steady or gone. */
	nextCheckAt(now: number): number | null {
		if (this.emptySince === null) return null;
		const leaveAt = this.emptySince + LINE_HOLD_MS;
		if (now < leaveAt) return leaveAt;
		const goneAt = leaveAt + LINE_LEAVE_MS;

		return now < goneAt ? goneAt : null;
	}
}
