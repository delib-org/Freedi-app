import { Statement } from '@freedi/shared-types';
import { isDerivedStatement, resolveDerivedPipeline } from '@/utils/derivedStatement';

/**
 * "Atoms" are the leaf ideas of a question: synths and originals that no synth
 * has absorbed. Topic-cluster containers only group other statements, and an
 * absorbed original is already counted inside its synth, so both are dropped.
 */
function isTopicContainer(option: Statement): boolean {
	return isDerivedStatement(option) && resolveDerivedPipeline(option) !== 'synthesis';
}

export function getAtomStatements(options: Statement[]): Statement[] {
	const absorbedIds = new Set<string>();

	for (const option of options) {
		// A topic cluster lists synths, which stay atoms; only a synth absorbs originals.
		if (!Array.isArray(option.integratedOptions) || isTopicContainer(option)) continue;

		for (const sourceId of option.integratedOptions) absorbedIds.add(sourceId);
	}

	return options.filter((option) => {
		if (option.integratedInto || absorbedIds.has(option.statementId)) return false;

		return !isTopicContainer(option);
	});
}
