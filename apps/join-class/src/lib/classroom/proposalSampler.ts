import { CLASS_BATCH_SIZE, type Statement } from '@freedi/shared-types';
import {
	CLASS_SAMPLING_CONFIG,
	adjustedPriority,
	isStable,
	type RandomFn,
	type SamplingConfig,
} from './samplingMath';

/**
 * Which proposals a phone gets next at "כל ההצעות" (IA 19.1). MC's
 * ProposalSampler, with the classroom's rule: everyone sees everything, so
 * stability never REMOVES a proposal. Unstable proposals are served first, by
 * Thompson/UCB priority; stable ones follow, also by priority.
 */

export interface SampleOptions {
	count?: number;
	config?: SamplingConfig;
	random?: RandomFn;
	now?: number;
}

interface Scored {
	proposal: Statement;
	stable: boolean;
	priority: number;
}

/**
 * Up to `count` proposals from `candidates` (the ones this phone has not been
 * served yet), unstable before stable, each group by priority, highest first.
 */
export function selectBatch(
	candidates: readonly Statement[],
	options: SampleOptions = {},
): Statement[] {
	const count = options.count ?? CLASS_BATCH_SIZE;
	if (count <= 0 || candidates.length === 0) return [];
	const config = options.config ?? CLASS_SAMPLING_CONFIG;
	const env = { config, random: options.random ?? Math.random, now: options.now ?? Date.now() };
	const scored: Scored[] = candidates.map((proposal) => ({
		proposal,
		stable: isStable(proposal, config),
		priority: adjustedPriority(proposal, env),
	}));
	scored.sort(
		(a, b) =>
			Number(a.stable) - Number(b.stable) ||
			b.priority - a.priority ||
			a.proposal.statementId.localeCompare(b.proposal.statementId),
	);

	return scored.slice(0, count).map((s) => s.proposal);
}
