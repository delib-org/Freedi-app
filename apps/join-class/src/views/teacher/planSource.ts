import { lessonFromSnapshot } from '@freedi/shared-types';
import type { ClassGame, ClassGameSnapshot, Statement } from '@freedi/shared-types';
import { getMainStatement, getSubQuestions } from '@/lib/store';
import { writeGameSnapshot } from '@/lib/classPlans';
import { orderedQuestions } from '@/lib/classroom/gameSnapshotEdit';

/**
 * What the plan screen is editing: a lesson's own statements (`/t/:mid/plan`) or a
 * prepared game's snapshot (`/t/plans/:planId/games/:gameId`, docs/ia/join-class-lesson-plan.md
 * 7 and 9.4). The screen and its controllers read the main statement and the questions
 * through here, and write through planApi / planIntroApi, so a game is the same screen on a
 * second backend.
 *
 * A game is shown as virtual statements built by the shared `lessonFromSnapshot` (the same
 * mapping the server uses to start a lesson), with each question's own key as its
 * `statementId` so the screen's drafts, order and deletes address it.
 */

let game: ClassGame | null = null;
let virtualFor: ClassGame | null = null;
let virtualMain: Statement | undefined;
let virtualQuestions: Statement[] = [];

/** Edits to the game that are in flight (writes the screen has not seen confirmed). */
export function isGameMode(): boolean {
	return game !== null;
}

/** The game on screen, or null when the screen is on a lesson. */
export function getGame(): ClassGame | null {
	return game;
}

/** Point the screen at a game (called by the controller whenever the game doc changes). */
export function setGame(next: ClassGame | null): void {
	game = next;
}

function build(source: ClassGame): void {
	virtualFor = source;
	const ordered = orderedQuestions(source.snapshot).filter((q) => q.text.trim() !== '');
	const keys = ordered.map((q) => q.key);
	const paragraphKeys = source.snapshot.paragraphs.map((p) => p.key);
	const queue = [...keys, ...paragraphKeys];
	const built = lessonFromSnapshot({
		snapshot: source.snapshot,
		homeId: source.planId,
		lessonId: source.gameId,
		title: source.title,
		creator: { uid: source.ownerUid, displayName: '' },
		classCode: '',
		now: source.lastUpdate,
		newId: () => queue.shift() ?? source.gameId,
	});
	virtualMain = built?.main;
	virtualQuestions = built?.questions ?? [];
}

function virtualOf(source: ClassGame): void {
	if (virtualFor !== source) build(source);
}

/** The lesson's main statement, or the game as one. */
export function getPlanMain(): Statement | undefined {
	if (!game) return getMainStatement() ?? undefined;
	virtualOf(game);

	return virtualMain;
}

/** The lesson's sub-questions, or the game's questions as statements. */
export function getPlanSubQuestions(): Statement[] {
	if (!game) return getSubQuestions();
	virtualOf(game);

	return virtualQuestions;
}

/**
 * Applies an edit to the game's snapshot: the screen sees it at once (the next call to
 * `getPlanMain` rebuilds), then the doc is written. A failed write throws; the doc listener
 * then brings back what the server holds.
 */
export async function editGame(
	edit: (snapshot: ClassGameSnapshot) => ClassGameSnapshot,
): Promise<void> {
	if (!game) throw new Error('no game is open');
	const current = game;
	const snapshot = edit(current.snapshot);
	game = { ...current, snapshot, lastUpdate: Date.now() };
	await writeGameSnapshot(current.planId, current.gameId, snapshot);
}
