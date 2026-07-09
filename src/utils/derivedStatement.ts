import { Statement, StatementType } from '@freedi/shared-types';

/**
 * Provenance of a statement produced by the clustering/synthesis pipeline.
 * Mirrors the vocabulary of `SynthesizedSolutionEntry` in shared-types.
 */
export type DerivedPipeline = 'topic-cluster' | 'synthesis' | 'unknown-cluster';

/**
 * Pipeline-derived statement detection. Cluster and synthesis spawns are
 * written to Firestore with `statementType: option`, so they are otherwise
 * indistinguishable from genuine participant submissions. Mirrors
 * `isDerivedStatement` in the MC app and `isDerived` in functions/src, so all
 * participation surfaces count and label the same set.
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
 * Which pipeline produced a derived statement. Documents written before
 * `derivedByPipeline` existed carry only `isCluster`, so they report
 * 'unknown-cluster' rather than being guessed into a specific pipeline.
 */
export function resolveDerivedPipeline(statement: Statement): DerivedPipeline {
	if (statement.derivedByPipeline) return statement.derivedByPipeline;
	if (statement.statementType === StatementType.synthesis) return 'synthesis';

	return 'unknown-cluster';
}
