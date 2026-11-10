import type { Statement } from '../../models/statement/StatementTypes';

/**
 * A live synthesis cluster: the AI-written proposal that stands in for the
 * originals listed in its `integratedOptions`. Topic clusters
 * (`derivedByPipeline: 'topic-cluster'`) only group distinct ideas and never
 * replace their members, so they do not count.
 *
 * @param statement - The statement to check
 */
export function isSynthesisCluster(statement: Statement): boolean {
	return (
		statement.hide !== true &&
		statement.isCluster === true &&
		statement.derivedByPipeline === 'synthesis' &&
		Array.isArray(statement.integratedOptions) &&
		statement.integratedOptions.length > 0
	);
}

/**
 * memberId -> synthId for every live synthesis cluster in `statements`.
 * First claim wins (the pipeline keeps one owner per original).
 *
 * @param statements - Raw statements (originals AND cluster docs mixed)
 */
export function buildSynthMembershipMap(statements: Statement[]): Map<string, string> {
	const membership = new Map<string, string>();

	for (const statement of statements) {
		if (!isSynthesisCluster(statement)) continue;
		for (const memberId of statement.integratedOptions ?? []) {
			if (!membership.has(memberId)) {
				membership.set(memberId, statement.statementId);
			}
		}
	}

	return membership;
}

/**
 * Widen a user's evaluated ids across synthesis: rating an original counts as
 * rating the synth that absorbed it (the synth inherits the vote), and rating
 * a synth counts for every original it covers. Keeps a participant from being
 * asked about the same idea twice, in either order.
 *
 * @param evaluatedIds - Statement ids the user already evaluated or was shown
 * @param statements - Statements that may include live synth docs
 */
export function expandEvaluatedIds(
	evaluatedIds: Iterable<string>,
	statements: Statement[],
): Set<string> {
	const expanded = new Set(evaluatedIds);

	for (const statement of statements) {
		if (!isSynthesisCluster(statement)) continue;
		const members = statement.integratedOptions ?? [];
		const touched =
			expanded.has(statement.statementId) || members.some((memberId) => expanded.has(memberId));
		if (!touched) continue;
		expanded.add(statement.statementId);
		members.forEach((memberId) => expanded.add(memberId));
	}

	return expanded;
}
