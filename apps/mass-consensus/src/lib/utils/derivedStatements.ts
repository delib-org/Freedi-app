/**
 * Derived-statement detection for the serving algorithm
 *
 * Cluster and synthesis statements are written with `statementType: option`,
 * so type-based Firestore queries cannot exclude them — they must be filtered
 * post-query using the derived markers. Mirrors the canonical `isDerived()`
 * in functions/src/synthesis/derivedDocs.ts (MC cannot import from functions).
 */

import {
	Statement,
	StatementType,
	buildSynthMembershipMap,
	isSynthesisCluster,
} from '@freedi/shared-types';

export {
	buildSynthMembershipMap,
	expandEvaluatedIds,
	isSynthesisCluster,
} from '@freedi/shared-types';

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
