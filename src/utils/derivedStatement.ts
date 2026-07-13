import { Statement, StatementType } from '@freedi/shared-types';

/**
 * Provenance of a statement produced by the clustering/synthesis pipeline.
 * Mirrors the vocabulary of `SynthesizedSolutionEntry` in shared-types.
 */
export type DerivedPipeline = 'topic-cluster' | 'synthesis' | 'unknown-cluster';

/**
 * Back-compat markers the synthesis pipeline writes through a
 * `Record<string, unknown>` cast, so they are absent from the Statement schema.
 * `isSynthesis` duplicates `derivedByPipeline === 'synthesis'` and is only read
 * here to date legacy documents; see `functions/src/synthesis/derivedDocs.ts`.
 */
interface LegacyDerivedFields {
	isSynthesis?: boolean;
	liveSynthOrigin?: string;
}

/**
 * Pipeline-derived statement detection. Cluster and synthesis spawns are
 * written to Firestore with `statementType: option`, so they are otherwise
 * indistinguishable from genuine participant submissions. Mirrors
 * `isDerivedStatement` in the MC app and `isDerived` in functions/src, so all
 * participation surfaces count and label the same set.
 */
export function isDerivedStatement(statement: Statement): boolean {
	const legacy = statement as Statement & LegacyDerivedFields;

	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		!!legacy.liveSynthOrigin ||
		statement.statementType === StatementType.synthesis
	);
}

/**
 * Which pipeline produced a derived statement. `derivedByPipeline` predates the
 * legacy `isSynthesis` boolean, so any document carrying `isSynthesis` also
 * carries the explicit field; `isSynthesis` is still consulted as a fallback in
 * case a document was written by a pipeline that only set the boolean. Clusters
 * older than either field report 'unknown-cluster' rather than being guessed.
 */
export function resolveDerivedPipeline(statement: Statement): DerivedPipeline {
	if (statement.derivedByPipeline) return statement.derivedByPipeline;
	if (statement.statementType === StatementType.synthesis) return 'synthesis';

	const legacy = statement as Statement & LegacyDerivedFields;
	if (typeof legacy.isSynthesis === 'boolean') {
		return legacy.isSynthesis ? 'synthesis' : 'topic-cluster';
	}

	return 'unknown-cluster';
}
