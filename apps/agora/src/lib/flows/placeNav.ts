/**
 * The four doors a student ever needs: the village, my note, the class's
 * board, the results.
 *
 * They used to be built twice — once as village chrome (a toolbar, two chips
 * and a floating button, several of them calling the same function) and once
 * as the flat view's tab bar — so a student who switched views had to learn
 * the game's navigation a second time. This module is the single answer to
 * "where can I go from here", and both bars render what it returns.
 *
 * Pure — no Mithril, no storage, no postMessage. The shell owns the doors
 * themselves; this only says which one is open and which are shut.
 */

export type PlaceDestination = 'village' | 'note' | 'board' | 'results';

/** What the student currently has open — the bar fills the matching tab */
export type OpenPlace = 'none' | 'note' | 'board' | 'results';

export interface PlaceNavInput {
	/** The 3D village is on screen. Without it there is no village to go back to */
	village: boolean;
	/** This station has a writing desk — a question or the deliberation */
	hasDesk: boolean;
	/** The student has a seat in the class: the board and the scoreboard exist */
	hasCommunity: boolean;
	/** The note is flying to the board; nothing may open until it lands */
	inFlight: boolean;
	open: OpenPlace;
}

export interface PlaceTab {
	id: PlaceDestination;
	active: boolean;
	locked: boolean;
	/** i18n key of the chip shown when a locked tab is pressed */
	hint?: string;
}

const HINT_NO_NOTE = 'village.nav.hint_no_note';
const HINT_NO_BOARD = 'village.nav.hint_no_board';
const HINT_NO_SEAT = 'village.nav.hint_no_seat';
const HINT_FLIGHT = 'village.nav.hint_flight';

/**
 * The four tabs in lesson order — go, write, read the others, see the
 * results. RTL flex renders the first at the right, which is where a
 * Hebrew reader starts.
 *
 * A door the student cannot use is shown locked rather than hidden: a bar
 * that changes shape between stations is a bar nobody learns, and the hint
 * explains the lock in one line.
 */
export function placeNavTabs(input: PlaceNavInput): PlaceTab[] {
	const { village, hasDesk, hasCommunity, inFlight, open } = input;

	const tab = (id: PlaceDestination, locked: boolean, hint?: string): PlaceTab => ({
		id,
		// A locked tab never reads as the place you are standing in
		active: !locked && open === (id === 'village' ? 'none' : id),
		locked,
		...(locked && hint ? { hint } : {}),
	});

	const noteHint = inFlight ? HINT_FLIGHT : HINT_NO_NOTE;
	const boardHint = inFlight ? HINT_FLIGHT : hasDesk ? HINT_NO_SEAT : HINT_NO_BOARD;

	return [
		...(village ? [tab('village', false)] : []),
		tab('note', !hasDesk || inFlight, noteHint),
		// The board is readable before you have written — only rating is gated,
		// and the board says so itself. Locking it here would hide the class's
		// notes from the slowest writer, who needs them most.
		tab('board', !hasDesk || !hasCommunity || inFlight, boardHint),
		tab('results', !hasCommunity, HINT_NO_SEAT),
	];
}

/** What the village shell has open, in the bar's vocabulary */
export function openPlaceOf(state: {
	opened: boolean;
	deskOpen: boolean;
	communityOpen: boolean;
	boardView: boolean;
	council?: boolean;
}): OpenPlace {
	if (state.communityOpen) return state.boardView ? 'board' : 'results';
	if (state.opened && state.deskOpen) return 'note';
	if (state.opened && state.council) return 'results';

	return 'none';
}
