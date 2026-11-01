import { Collections, Statement, getRandomUID } from '@freedi/shared-types';
import { db, doc, deleteDoc } from '@/lib/firebase';
import { isAdmin } from '@/lib/admin';
import {
	createSubQuestion,
	setMainStatementSetting,
	setQuestionSetting,
	setStatementLanguage,
	setSubQuestionsOrder,
	updateQuestionTitle,
} from '@/lib/store';
import {
	addQuestion,
	removeQuestion,
	reorderQuestions,
	setDetails,
	setLanguage,
	setQuestionHint,
	setQuestionText,
	type GameDetails,
} from '@/lib/classroom/gameSnapshotEdit';
import type { ClassRole } from './planHelpers';
import { editGame, isGameMode } from './planSource';

/** Firestore writes for the plan screen, on top of Join's own store helpers - or, on a
 *  game, edits of the game's snapshot (planSource.ts). Every function throws on failure;
 *  the screen turns that into an inline error with a retry. */

/** Firestore deep-merges the map, so the question's other settings are untouched. */
function settingsPatch(settings: { classRole?: ClassRole; hint?: string }): Partial<Statement> {
	return { statementSettings: settings };
}

/** Lesson-level details on the main statement (deep-merged into statementSettings). */
export async function saveLessonDetails(mainId: string, details: GameDetails): Promise<void> {
	if (isGameMode()) return editGame((s) => setDetails(s, details));
	await setMainStatementSetting(mainId, { statementSettings: details });
}

/** The lesson language; `null` = each student's own device language. */
export async function saveLessonLanguage(mainId: string, language: string | null): Promise<void> {
	if (isGameMode()) return editGame((s) => setLanguage(s, language));
	await setStatementLanguage(mainId, language);
}

export async function saveQuestionText(statementId: string, text: string): Promise<void> {
	if (isGameMode()) return editGame((s) => setQuestionText(s, statementId, text));
	await updateQuestionTitle(statementId, text);
}

export async function saveQuestionHint(statementId: string, hint: string): Promise<void> {
	if (isGameMode()) return editGame((s) => setQuestionHint(s, statementId, hint));
	await setQuestionSetting(statementId, settingsPatch({ hint }));
}

/** Create a sub-question and give it its class role (and, for table
 *  questions, its place at the end of the list). Returns the new id. */
export async function createPlanQuestion(
	mainId: string,
	text: string,
	role: ClassRole,
	order: number | undefined,
	onCreated?: (statementId: string) => void,
): Promise<string> {
	if (isGameMode()) {
		const key = getRandomUID();
		onCreated?.(key);
		await editGame((s) => addQuestion(s, { key, text, role, order }));

		return key;
	}
	// role and order go in the create itself: a second patch after the create's ack
	// could land after the teacher's first reorder and overwrite it
	const id = await createSubQuestion(mainId, text, { classRole: role, order });
	if (!id) throw new Error('createSubQuestion returned no id');
	onCreated?.(id);

	return id;
}

export async function persistQuestionOrder(orderedIds: string[]): Promise<void> {
	if (isGameMode()) return editGame((s) => reorderQuestions(s, orderedIds));
	await setSubQuestionsOrder(orderedIds);
}

/** Remove a question the teacher added. Admin only; the rules allow the
 *  creator and workspace admins. */
export async function deletePlanQuestion(statementId: string): Promise<void> {
	if (!isAdmin()) throw new Error('not an admin');
	if (isGameMode()) return editGame((s) => removeQuestion(s, statementId));
	await deleteDoc(doc(db, Collections.statements, statementId));
}
