import { allowOwnQuestionsOf, noQuestionsLeft } from '@freedi/shared-types';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { getGuidingQuestions } from '@/lib/lessonCore';
import { getMainStatement, getSubQuestions } from '@/lib/store';

/**
 * "Students may add their own question" (IA 25.4), as the screens read it.
 * With the setting off, a table asks only the teacher's questions: the turn
 * count and the "done" state follow from how many of those exist.
 */

/** The lesson's guiding questions the teacher wrote (not a table's own). */
export function teacherQuestionIds(questions: readonly Statement[]): string[] {
	return getGuidingQuestions(questions)
		.filter((q) => !q.classTable)
		.map((q) => q.statementId);
}

/** Own questions are off and this table has asked every teacher question. */
export function noneLeftFor(
	table: Pick<ClassTable, 'usedQuestionIds'>,
	main: Statement | null | undefined,
	questions: readonly Statement[],
): boolean {
	return noQuestionsLeft(table, teacherQuestionIds(questions), allowOwnQuestionsOf(main));
}

/** The same, read from the live lesson (the teacher's board has no props for it). */
export function noneLeftNow(table: Pick<ClassTable, 'usedQuestionIds'>): boolean {
	return noneLeftFor(table, getMainStatement(), getSubQuestions());
}

/**
 * How many turns a table can have: with own questions off, never more than
 * there are teacher questions; null while own questions are allowed.
 */
export function questionCapOf(
	main: Statement | null | undefined,
	questions: readonly Statement[],
): number | null {
	return allowOwnQuestionsOf(main) ? null : teacherQuestionIds(questions).length;
}

/** `questionCapOf` read from the live lesson. */
export function questionCapNow(): number | null {
	return questionCapOf(getMainStatement(), getSubQuestions());
}
