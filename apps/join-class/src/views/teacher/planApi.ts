import { Collections, Statement } from '@freedi/shared-types';
import { db, doc, deleteDoc } from '@/lib/firebase';
import { isAdmin } from '@/lib/admin';
import {
	createSubQuestion,
	setQuestionSetting,
	setSubQuestionsOrder,
	updateQuestionTitle,
} from '@/lib/store';
import type { ClassRole } from './planHelpers';

/** Firestore writes for the plan screen, on top of Join's own store helpers.
 *  Every function throws on failure; the screen turns that into an inline
 *  error with a retry. */

/** `classRole` and `hint` are not in the shared `StatementSettings` type yet,
 *  so the patch is cast once, here. Firestore deep-merges the map, so the
 *  question's other settings are untouched. */
function settingsPatch(settings: Record<string, string>): Partial<Statement> {
	return { statementSettings: settings } as unknown as Partial<Statement>;
}

export async function saveQuestionText(statementId: string, text: string): Promise<void> {
	await updateQuestionTitle(statementId, text);
}

export async function saveQuestionHint(statementId: string, hint: string): Promise<void> {
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
	const id = await createSubQuestion(mainId, text);
	if (!id) throw new Error('createSubQuestion returned no id');
	onCreated?.(id);
	const patch: Partial<Statement> = settingsPatch({ classRole: role });
	if (order !== undefined) patch.order = order;
	await setQuestionSetting(id, patch);

	return id;
}

export async function persistQuestionOrder(orderedIds: string[]): Promise<void> {
	await setSubQuestionsOrder(orderedIds);
}

/** Remove a question the teacher added. Admin only; the rules allow the
 *  creator and workspace admins. */
export async function deletePlanQuestion(statementId: string): Promise<void> {
	if (!isAdmin()) throw new Error('not an admin');
	await deleteDoc(doc(db, Collections.statements, statementId));
}
