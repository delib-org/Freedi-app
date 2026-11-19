import type { LiveDraft } from '@/lib/liveDrafts';

/**
 * Live writing at the table (IA join-class-proposals-flow §5): only the pen
 * holder writes, and the tablemates read that student's text as their screen.
 * The text travels as a live draft (lib/liveDrafts.ts); the table doc says who
 * holds the pen, so these rules only pick the pen holder's draft. No Firebase,
 * no DOM.
 */

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
 * The text the pen holder has typed so far: their draft, never mine. Empty while
 * they have typed nothing yet (or the draft has not arrived). The table doc, not
 * the draft, decides who holds the pen, so a stale draft of someone who gave the
 * pen back is never shown.
 */
export function penTextOf(
	drafts: readonly LiveDraft[],
	writerUid: string | undefined,
	selfUid: string,
): string {
	if (!writerUid || writerUid === selfUid) return '';

	return drafts.find((d) => d.userId === writerUid)?.text ?? '';
}
