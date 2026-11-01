/**
 * Two small truths of a booth's board, pure so they are tested in node.
 *
 * The board said "no notes yet" to a student of a large class who had not
 * written, while eight classmates' notes were there: with the lottery on, the
 * hand is dealt only after writing, so the visible list was empty and the
 * empty line lied. And it numbered my own note as note 1, so the first
 * classmate on screen was "note 2".
 */

export interface BoardEmptyInput {
	/** What the board shows me (my hand when the lottery is on) */
	visible: number;
	/** Classmates' notes under the booth, dealt to me or not */
	classmates: number;
	/** The lottery deals the notes (a large class) */
	lottery: boolean;
	/** The booth still takes notes */
	live: boolean;
	/** I have a note here */
	hasMine: boolean;
	/** A seat that could write: not the teacher watching, not a read-only board */
	canWrite: boolean;
}

/**
 * The line an empty board shows: null when the board is not empty, the
 * "notes are here, write yours to get some to read" count when the lottery is
 * holding them back, and the plain "no notes yet" only when none exist.
 */
export function boardEmptyLine(
	input: BoardEmptyInput,
): { key: 'village.board.write_to_read'; n: number } | { key: 'village.board.empty' } | null {
	if (input.visible > 0) return null;
	if (input.lottery && input.live && !input.hasMine && input.canWrite && input.classmates > 0)
		return { key: 'village.board.write_to_read', n: input.classmates };

	return { key: 'village.board.empty' };
}

/**
 * A classmate's note number on this board: its place among the classmates'
 * notes, from 1. My own note is "my note", never a number, so it does not push
 * everyone else's count up by one.
 */
export function classmateNumber(
	notes: ReadonlyArray<{ statementId: string; creatorId: string }>,
	userId: string,
	statementId: string,
): number {
	const classmates = notes.filter((note) => note.creatorId !== userId);

	return Math.max(1, classmates.findIndex((note) => note.statementId === statementId) + 1);
}
