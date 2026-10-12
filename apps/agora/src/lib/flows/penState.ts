/**
 * What the answer box holds, and when it must be emptied.
 *
 * Pure: no Mithril, no Firestore. The stage slot reuses ONE component for
 * every question in the plan, so a view's closure outlives the question it was
 * written for — which is how a student's personal story was still sitting in
 * the needs round's box, one tap away from being posted as an answer to a
 * question nobody wrote it for. The box therefore belongs to an item, not to a
 * screen, and the rule that says so is here where it can be tested rather than
 * inline in two views that drifted apart.
 *
 * Two things fill the box, and only two:
 *  - a new item empties it;
 *  - my own saved answer pre-fills it, once per text, so re-opening a question
 *    I answered shows what I wrote and the button reads as an edit.
 * Anything else is the student typing, and must survive every redraw.
 */

export interface Pen {
	/** What the textarea shows */
	readonly text: string;
	/** The plan item this text belongs to — '' before the first question */
	readonly itemId: string;
	/** The saved answer the text was taken from, as `statementId:statement` */
	readonly from: string;
	/**
	 * Unsent words left at other questions, by item. The teacher's call can
	 * walk a student away mid-sentence; the sentence waits here and is back
	 * in the box when they return to that question.
	 */
	readonly parked?: Readonly<Record<string, string>>;
}

export const blankPen: Pen = { text: '', itemId: '', from: '' };

/**
 * The unsent first words of `current`, if any — what a move away must not
 * lose. An edit of an answer already saved is not parked: coming back shows
 * what was saved, as it always did.
 */
function unsentText(current: Pen): string {
	if (!current.itemId || current.from || !current.text.trim()) return '';

	return current.text;
}

/** My saved answer to the question on screen, as the view knows it */
export interface SavedAnswer {
	statementId: string;
	statement: string;
}

/**
 * The box as it should stand for `itemId`, given what is in it now.
 *
 * Returns the SAME object when nothing changes, so a caller can tell a real
 * transition from a redraw (the views use that to clear a stale save error).
 */
export function penFor(current: Pen, itemId: string, mine?: SavedAnswer): Pen {
	let base: Pen;
	if (current.itemId === itemId) {
		base = current;
	} else {
		// Leaving a question: park what was not sent; arriving: take back what waited here
		const parked: Record<string, string> = { ...(current.parked ?? {}) };
		const leaving = unsentText(current);
		if (leaving) parked[current.itemId] = leaving;
		const returning = parked[itemId] ?? '';
		delete parked[itemId];
		base = {
			text: returning,
			itemId,
			from: '',
			...(Object.keys(parked).length > 0 ? { parked } : {}),
		};
	}

	if (!mine) return base;

	const from = `${mine.statementId}:${mine.statement}`;
	if (base.from === from) return base;

	return { ...base, text: mine.statement, itemId, from };
}

/** The student typing. Keeps the box's identity, replaces only the text. */
export function typedInto(current: Pen, text: string): Pen {
	return { ...current, text };
}
