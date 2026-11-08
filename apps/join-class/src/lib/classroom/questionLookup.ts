import type { Statement } from '@freedi/shared-types';

/**
 * The text of the question a table chose. The live sub-question list is the
 * first source; a question that is not in it yet (the other phone's own
 * question arrives on a different listener than the table doc) is fetched once
 * by id and cached.
 */
export function questionTextFrom(
	questions: readonly Pick<Statement, 'statementId' | 'statement'>[],
	fetched: ReadonlyMap<string, string>,
	questionId: string | undefined,
): string | null {
	if (!questionId) return '';
	const live = questions.find((q) => q.statementId === questionId);
	if (live) return live.statement;

	return fetched.get(questionId) ?? null;
}
