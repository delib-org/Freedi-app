/**
 * `onStatementCreated` task for the question-progress funnel.
 *
 * - A NEW, non-derived `option` with a real creator flips the creator's
 *   `suggested` marker on the parent question and counts one option event.
 * - Any other child creation just bumps `lastActivity` on the parent and
 *   its top parent (cheap merge) so Home / Studio can sort by recency.
 */

import { Statement, StatementType } from '@freedi/shared-types';
import { recordParticipation, touchActivity } from './questionProgressWriter';

const TOP = 'top';

/** Mirrors `isDerivedOption` in src/controllers/hooks/useParticipationStats.ts. */
export function isDerivedOption(statement: Statement): boolean {
	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		statement.statementType === StatementType.synthesis
	);
}

export async function recordSuggestionProgress(statement: Statement): Promise<void> {
	const parentId = statement.parentId;
	if (!parentId || parentId === TOP) return;

	const creatorId = statement.creatorId || statement.creator?.uid;
	const topParentId =
		statement.topParentId && statement.topParentId !== TOP ? statement.topParentId : undefined;

	const isGenuineOption =
		statement.statementType === StatementType.option && !isDerivedOption(statement) && !!creatorId;

	if (isGenuineOption) {
		await recordParticipation({
			statementId: parentId,
			topParentId,
			organizationId: statement.organizationId,
			userId: creatorId,
			kind: 'suggested',
			eventCounter: 'options',
			now: statement.createdAt,
		});

		return;
	}

	await touchActivity({
		statementId: parentId,
		topParentId,
		organizationId: statement.organizationId,
		now: statement.createdAt,
	});
}
