/**
 * What a scrolling board hides below its fold.
 *
 * On a phone the village board shows the student's own note and, at most,
 * the top of one classmate's card; the rest of the class is out of sight,
 * and nothing on screen said so. The board measures its cards and asks this
 * module how many have not started yet — that number is the "N more notes
 * below" hint. Pure: the component feeds it rectangles, so it is tested in
 * node without a browser.
 */

export interface CardEdges {
	top: number;
	bottom: number;
}

/**
 * Cards that start under the fold, so the student cannot see that they exist.
 * A card whose top edge is visible already announces itself; the half-pixel
 * slack keeps a card sitting exactly on the line from flickering in and out.
 */
export function notesBelowFold(cards: readonly CardEdges[], fold: number): number {
	return cards.filter((card) => card.top > fold - 0.5).length;
}

/**
 * The card the "more below" hint should bring up: the first one the fold
 * cuts or hides. -1 when everything is already in view.
 */
export function nextCardBelow(cards: readonly CardEdges[], fold: number): number {
	return cards.findIndex((card) => card.bottom > fold + 0.5);
}
