import { Statement } from '@freedi/shared-types';

/**
 * True when the selected options changed since the summary was written.
 * Summaries saved before `summarySelectedIds` existed, and questions whose
 * selection is not loaded yet, are never marked obsolete.
 */
export function isSummaryObsolete(
	statement: Pick<Statement, 'summarySelectedIds' | 'results'>,
): boolean {
	const { summarySelectedIds, results } = statement;
	if (!summarySelectedIds || !results) return false;

	const current = results.map((result) => result.statementId).sort();
	const summarized = [...summarySelectedIds].sort();

	return current.length !== summarized.length || current.some((id, i) => id !== summarized[i]);
}
