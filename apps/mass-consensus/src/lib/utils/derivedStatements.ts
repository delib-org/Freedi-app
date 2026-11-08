/**
 * Derived-statement detection for the serving algorithm
 *
 * Cluster and synthesis statements are written with `statementType: option`,
 * so type-based Firestore queries cannot exclude them — they must be filtered
 * post-query using the derived markers. Mirrors the canonical `isDerived()`
 * in functions/src/synthesis/derivedDocs.ts (MC cannot import from functions).
 */

import { Statement, StatementType } from '@freedi/shared-types';

/**
 * Check if a statement is pipeline-derived output (cluster or synthesis).
 * Derived statements must never be served to users for evaluation.
 *
 * Deliberately inclusive — any marker counts, to catch legacy/partially-tagged docs.
 *
 * @param statement - The statement to check
 */
export function isDerivedStatement(statement: Statement): boolean {
	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		statement.statementType === StatementType.synthesis
	);
}

/**
 * Check if a statement is an original servable for evaluation.
 *
 * Originals hidden by integration (`hide: true` + `integratedInto` set) remain
 * servable — clustering must not remove originals from evaluation. Statements
 * hidden without `integratedInto` (moderation) stay excluded.
 *
 * @param statement - The statement to check
 */
export function isServableOriginal(statement: Statement): boolean {
	if (isDerivedStatement(statement)) {
		return false;
	}

	if (!statement.hide) {
		return true;
	}

	// Hidden only because it was merged into a cluster → still serve the original
	return !!statement.integratedInto;
}

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
 * What an evaluator is served once synthesis is active: each live synth in
 * place of the originals it merged, plus every original no synth covers.
 * Evaluating the synth is evaluating the idea its members share, and the synth
 * inherits their votes server-side, so serving both would ask twice.
 *
 * @param statements - Raw statements (originals AND cluster docs mixed)
 */
export function selectServableForEvaluation(statements: Statement[]): Statement[] {
	const synthMembership = buildSynthMembershipMap(statements);

	return statements.filter(
		(statement) =>
			isSynthesisCluster(statement) ||
			(isServableOriginal(statement) && !synthMembership.has(statement.statementId))
	);
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
	statements: Statement[]
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
