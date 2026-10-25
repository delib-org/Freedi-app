import type { Statement } from '@freedi/shared-types';

/**
 * Bayesian UCB + Gaussian Thompson Sampling for "כל ההצעות" (IA 19), ported
 * from Mass Consensus (apps/mass-consensus/src/lib/utils/sampling.ts) as pure
 * functions: no logger, and the random source and the clock are injected so
 * tests are deterministic. The maths and the weights are MC's; only the
 * recency window is the classroom's (a lesson, not a day).
 */

export interface SamplingConfig {
	/** Evaluations after which a proposal may count as stable. */
	targetEvaluations: number;
	/** Standard error under which a proposal may count as stable. */
	targetSEM: number;
	/** UCB exploration weight (kappa). */
	explorationKappa: number;
	/** New proposals get wider uncertainty for this long. */
	recencyBoostMs: number;
	/** Prior pseudo-count. */
	priorStrength: number;
	/** Prior mean on the -1..+1 scale. */
	priorMean: number;
	/** Lowest priority an unstable proposal can have. */
	explorationFloor: number;
}

const MS_PER_HOUR = 3_600_000;

/** MC's defaults, with the recency window of one lesson hour. */
export const CLASS_SAMPLING_CONFIG: SamplingConfig = {
	targetEvaluations: 30,
	targetSEM: 0.15,
	explorationKappa: 1.5,
	recencyBoostMs: MS_PER_HOUR,
	priorStrength: 2,
	priorMean: 0,
	explorationFloor: 0.1,
};

/** Random source in [0, 1). */
export type RandomFn = () => number;

export interface SamplingEnv {
	config: SamplingConfig;
	random: RandomFn;
	now: number;
}

const BASE_UNCERTAINTY = 0.5;
const MIN_SEM = 0.05;
const Z_95 = 1.96;
const UCB_WEIGHT = 0.55;
const THOMPSON_WEIGHT = 0.45;
const RECOVERY_WEIGHT = 0.15;
const THRESHOLD_WEIGHT = 0.1;
const STABLE_BASE = 0.05;
const STABLE_JITTER = 0.05;
const RECOVERY_CROSSING_FACTOR = 0.8;
const RECOVERY_CLEAR_FACTOR = 0.3;
const RECOVERY_CLEAR_CAP = 0.5;
const MAX_UNCERTAINTY_RATIO = 2;
const THRESHOLD_FACTOR = 0.8;

export interface ProposalStats {
	mean: number;
	posteriorMean: number;
	sem: number;
	evaluationCount: number;
}

/** Normal-Normal posterior from the aggregate fields the server keeps on each option. */
export function statsOf(proposal: Statement, config: SamplingConfig): ProposalStats {
	const sum = proposal.evaluation?.sumEvaluations ?? 0;
	const sumSquared = proposal.evaluation?.sumSquaredEvaluations ?? 0;
	const n = proposal.evaluation?.numberOfEvaluators ?? 0;
	const { priorStrength, priorMean } = config;
	if (n <= 0) {
		return { mean: 0, posteriorMean: priorMean, sem: BASE_UNCERTAINTY, evaluationCount: 0 };
	}
	const mean = sum / n;
	const effective = n + priorStrength;
	const posteriorMean = (priorStrength * priorMean + sum) / effective;
	let sem = Math.max(MIN_SEM, BASE_UNCERTAINTY / Math.sqrt(effective));
	if (n > 1) {
		const variance = Math.max(0, sumSquared / n - mean * mean);
		const spread = Math.max(Math.sqrt(variance), BASE_UNCERTAINTY / 2);
		sem = Math.max(MIN_SEM, spread / Math.sqrt(effective));
	}

	return { mean, posteriorMean, sem, evaluationCount: n };
}

/** 2.0 for a brand-new proposal, falling to 1.0 at the end of the recency window. */
function recencyMultiplier(proposal: Statement, env: SamplingEnv): number {
	const age = env.now - (proposal.createdAt ?? env.now);
	if (age >= env.config.recencyBoostMs) return 1;

	return 1 + (1 - Math.max(0, age) / env.config.recencyBoostMs);
}

/** A standard normal sample (Box-Muller). */
function standardNormal(random: RandomFn): number {
	let u1 = 0;
	while (u1 === 0) u1 = random();

	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * random());
}

function toUnit(value: number): number {
	return (value + 1) / 2;
}

export function isStable(proposal: Statement, config: SamplingConfig): boolean {
	const stats = statsOf(proposal, config);

	return stats.evaluationCount >= config.targetEvaluations && stats.sem < config.targetSEM;
}

function ucbPriority(stats: ProposalStats, multiplier: number, config: SamplingConfig): number {
	return toUnit(stats.posteriorMean + config.explorationKappa * stats.sem * multiplier);
}

function thompsonSample(stats: ProposalStats, multiplier: number, random: RandomFn): number {
	const sample = stats.posteriorMean + standardNormal(random) * stats.sem * multiplier;

	return Math.max(0, Math.min(1, toUnit(sample)));
}

function crossesZero(stats: ProposalStats): boolean {
	return stats.posteriorMean - Z_95 * stats.sem < 0 && stats.posteriorMean + Z_95 * stats.sem > 0;
}

/** Anti-burial: a negative proposal that is still uncertain gets a chance to recover. */
function recoveryScore(stats: ProposalStats, config: SamplingConfig): number {
	if (stats.posteriorMean >= 0) return 0;
	const ratio = Math.min(MAX_UNCERTAINTY_RATIO, stats.sem / config.targetSEM);
	if (crossesZero(stats)) return Math.min(1, ratio * RECOVERY_CROSSING_FACTOR);

	return Math.min(RECOVERY_CLEAR_CAP, ratio * RECOVERY_CLEAR_FACTOR);
}

/** A proposal whose interval crosses zero needs data to decide its side. */
function thresholdScore(stats: ProposalStats): number {
	if (!crossesZero(stats)) return 0;

	return (1 - Math.min(1, Math.abs(stats.posteriorMean) / stats.sem)) * THRESHOLD_FACTOR;
}

/** MC's adjusted priority: UCB vetting + Thompson exploration + recovery + threshold, floored. */
export function adjustedPriority(proposal: Statement, env: SamplingEnv): number {
	const { config, random } = env;
	if (isStable(proposal, config)) return STABLE_BASE + random() * STABLE_JITTER;
	const stats = statsOf(proposal, config);
	const multiplier = recencyMultiplier(proposal, env);
	const base =
		UCB_WEIGHT * ucbPriority(stats, multiplier, config) +
		THOMPSON_WEIGHT * thompsonSample(stats, multiplier, random);
	const bonuses =
		recoveryScore(stats, config) * RECOVERY_WEIGHT + thresholdScore(stats) * THRESHOLD_WEIGHT;

	return Math.min(1, Math.max(config.explorationFloor, base + bonuses));
}
