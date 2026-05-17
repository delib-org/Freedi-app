import type { Statement } from '@freedi/shared-types';

/**
 * Bayesian-shrunk scoring for the synthesis pre-filter.
 *
 * Raw average is a poor signal at the long tail: an option with one +1 vote
 * beats one with twenty +0.95 votes, even though the second is far better
 * supported. Bayesian shrinkage pulls low-evidence values toward a global
 * prior so confident-and-good wins over loud-but-thin.
 *
 *     score = (v · avg + m · prior) / (v + m)
 *
 * where:
 *   v     = number of evaluators on the option
 *   avg   = the option's consensus (mean evaluation)
 *   prior = global mean across all options under the question
 *   m     = prior weight (defaults to 5; ~equivalent to "5 neutral votes")
 *
 * Filter rule: keep options whose Bayesian score >= prior + cutoffSigmas · σ,
 * where σ is the standard deviation of consensus across the input set.
 *
 * Wilson lower-bound is intentionally NOT used here: Freedi evaluations are
 * continuous on [-1, 1], not binary success/failure. Wilson would be wrong.
 *
 * Pure function — no Firestore, no I/O. Safe to call from any environment.
 */

export interface BayesianFilterOptions {
	/** Prior weight ("equivalent neutral votes"). Default 5. */
	priorWeight?: number;
	/** Cutoff in standard deviations above the global prior. Default 0.5. */
	cutoffSigmas?: number;
	/**
	 * Hard floor on number of evaluators. Options below this are dropped
	 * regardless of their score. Default 0 (no floor — Bayesian shrinkage
	 * already handles low-evidence options). Set this if the admin wants
	 * to enforce "at least N votes" independently of statistical filtering.
	 */
	minEvaluators?: number;
}

export interface ScoredOption {
	statement: Statement;
	rawConsensus: number;
	bayesianScore: number;
	evaluatorCount: number;
}

export interface BayesianFilterResult {
	kept: ScoredOption[];
	dropped: ScoredOption[];
	stats: {
		inputCount: number;
		keptCount: number;
		prior: number;
		sigma: number;
		cutoff: number;
		priorWeight: number;
		cutoffSigmas: number;
	};
}

const DEFAULT_PRIOR_WEIGHT = 5;
const DEFAULT_CUTOFF_SIGMAS = 0.5;

function getEvaluatorCount(s: Statement): number {
	// Statement carries multiple count fields populated by different code paths
	// (totalEvaluators on the doc; evaluation.numberOfEvaluators on the nested
	// aggregate). Prefer the nested aggregate, fall back to the legacy top-
	// level count, then to 0.
	const nested = s.evaluation?.numberOfEvaluators;
	if (typeof nested === 'number' && nested >= 0) return nested;
	const legacy = (s as Statement & { totalEvaluators?: number }).totalEvaluators;
	if (typeof legacy === 'number' && legacy >= 0) return legacy;

	return 0;
}

function getConsensus(s: Statement): number {
	// Statement.consensus is the canonical mean evaluation in [-1, 1]. The
	// nested evaluation.agreement is semantically equivalent and used by
	// newer UI code; either is fine.
	const c = s.consensus;
	if (typeof c === 'number') return c;
	const agreement = s.evaluation?.agreement;
	if (typeof agreement === 'number') return agreement;

	return 0;
}

/**
 * Compute the global prior (mean of consensus across the input set) and
 * standard deviation. Used by both the standalone filter and any caller
 * that wants the same numbers for telemetry without re-running the filter.
 */
export function computePriorAndSigma(statements: Statement[]): { prior: number; sigma: number } {
	if (statements.length === 0) return { prior: 0, sigma: 0 };
	let sum = 0;
	for (const s of statements) sum += getConsensus(s);
	const prior = sum / statements.length;
	let varSum = 0;
	for (const s of statements) {
		const d = getConsensus(s) - prior;
		varSum += d * d;
	}
	const sigma = Math.sqrt(varSum / statements.length);

	return { prior, sigma };
}

/**
 * Apply the Bayesian shrunk-score filter and return both the kept and
 * dropped sets, plus telemetry. Callers that only need the IDs can map
 * `result.kept` to `s => s.statement.statementId`.
 */
export function bayesianFilterOptions(
	statements: Statement[],
	options: BayesianFilterOptions = {},
): BayesianFilterResult {
	const priorWeight = options.priorWeight ?? DEFAULT_PRIOR_WEIGHT;
	const cutoffSigmas = options.cutoffSigmas ?? DEFAULT_CUTOFF_SIGMAS;
	const minEvaluators = options.minEvaluators ?? 0;

	const { prior, sigma } = computePriorAndSigma(statements);
	const cutoff = prior + cutoffSigmas * sigma;

	const kept: ScoredOption[] = [];
	const dropped: ScoredOption[] = [];

	for (const statement of statements) {
		const evaluatorCount = getEvaluatorCount(statement);
		const rawConsensus = getConsensus(statement);
		const bayesianScore =
			(evaluatorCount * rawConsensus + priorWeight * prior) / (evaluatorCount + priorWeight);

		const scored: ScoredOption = {
			statement,
			rawConsensus,
			bayesianScore,
			evaluatorCount,
		};

		if (evaluatorCount < minEvaluators) {
			dropped.push(scored);
		} else if (bayesianScore >= cutoff) {
			kept.push(scored);
		} else {
			dropped.push(scored);
		}
	}

	return {
		kept,
		dropped,
		stats: {
			inputCount: statements.length,
			keptCount: kept.length,
			prior,
			sigma,
			cutoff,
			priorWeight,
			cutoffSigmas,
		},
	};
}
