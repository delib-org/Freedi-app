/**
 * Stakeholder population resolution.
 *
 * N — the number of stakeholders — is everyone with standing in a decision,
 * whether or not the process managed to reach them. A settlement of 500
 * residents has 500 stakeholders even if only 320 were ever invited: the 180
 * the process missed are a shortcoming of the process, not people who agreed.
 * Read that way, a census means EVERY stakeholder spoke, which is the correct
 * bar for claiming there is nothing left to infer — see
 * `finitePopulationFactor` in ./consensusCalculation.
 *
 * N is declared by a human or it is absent. A deliberation declares its
 * stakeholders once, on the group or the question, and every option beneath
 * inherits it. This module is the single place that walk happens, so the
 * server trigger, the recalculation tools and the client all agree on N by
 * construction.
 *
 * Nothing is inferred. Not from subscribers (subscribing is what a browser does
 * on your behalf the moment you open a page, so member counts measure traffic)
 * and not from voters (turnout answers "who showed up", never "who this
 * decision is about", and it understates N, which inflates the corrected
 * score). Absent means open population — no bounded stakeholder set — and
 * yields the uncorrected formula. That is the safe default, and it is why every
 * accessor here returns `undefined` rather than guessing.
 */

/**
 * The minimum a statement must look like to take part in the walk. Structural
 * on purpose: callers pass raw Firestore data, parsed Statements, or Redux
 * state without converting.
 */
export interface StakeholderScope {
	evaluationSettings?: { targetPopulation?: number; samplingQuality?: number } | undefined;
}

/** Where the resolved N came from — surface this, never just the number */
export type StakeholderSource = 'self' | 'parent' | 'top';

export interface StakeholderResolution {
	/** N, or undefined when no bounded stakeholder set is known */
	count?: number;
	/** Which level supplied it. Undefined exactly when `count` is undefined. */
	source?: StakeholderSource;
}

const NOT_RESOLVED: StakeholderResolution = {};

/**
 * A stakeholder count has to be a real, positive, finite headcount. Zero is
 * rejected rather than treated as a census of nobody: it is what a cleared
 * input field and a default-initialised counter both look like, and reading it
 * as "everyone has spoken" would hand a perfect score to missing data.
 */
function validCount(value: number | undefined): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}

	return value;
}

function declared(scope?: StakeholderScope): number | undefined {
	return validCount(scope?.evaluationSettings?.targetPopulation);
}

/**
 * Resolve N for a statement from its own settings and its ancestors.
 *
 * Order, most specific first:
 *   1. self   — this statement overrides everything
 *   2. parent — the question it belongs to
 *   3. top    — the group or deliberation it belongs to
 *
 * Only a number a human typed into `evaluationSettings.targetPopulation`
 * counts. When none of the three declares one, the result is empty and the
 * caller uses the uncorrected formula.
 */
export function resolveStakeholderCount(
	self?: StakeholderScope,
	parent?: StakeholderScope,
	top?: StakeholderScope,
): StakeholderResolution {
	const selfDeclared = declared(self);
	if (selfDeclared !== undefined) {
		return { count: selfDeclared, source: 'self' };
	}

	const parentDeclared = declared(parent);
	if (parentDeclared !== undefined) {
		return { count: parentDeclared, source: 'parent' };
	}

	const topDeclared = declared(top);
	if (topDeclared !== undefined) {
		return { count: topDeclared, source: 'top' };
	}

	return NOT_RESOLVED;
}

/**
 * Sampling quality inherits exactly like the stakeholder count, and for the
 * same reason: it describes how the participants were reached, which is a
 * property of the deliberation, not of one option inside it. Walks self →
 * parent → top and returns undefined when nobody declared one, leaving the
 * caller to apply DEFAULT_SAMPLING_QUALITY.
 */
export function resolveSamplingQuality(
	self?: StakeholderScope,
	parent?: StakeholderScope,
	top?: StakeholderScope,
): number | undefined {
	for (const scope of [self, parent, top]) {
		const quality = scope?.evaluationSettings?.samplingQuality;
		if (typeof quality === 'number' && Number.isFinite(quality) && quality > 0) {
			return quality;
		}
	}

	return undefined;
}

/**
 * How much of the stakeholder body has actually spoken, in [0, 1].
 *
 * Every surface showing a finite-population-corrected score should show this
 * too. The correction makes the score depend on N, and understating N inflates
 * it — with 50 respondents, declaring 50 stakeholders instead of 500 moves C_p
 * from 0.420 to 0.600. Publishing "50 of 500" turns N from a private dial into
 * a claim a reader can weigh for themselves.
 *
 * Returns undefined when no stakeholder set is known, which is the honest
 * answer: without N there is no such thing as coverage.
 */
export function stakeholderCoverage(
	numberOfEvaluators: number,
	populationSize?: number,
): number | undefined {
	const total = validCount(populationSize);
	if (total === undefined) return undefined;

	return Math.min(1, Math.max(0, numberOfEvaluators / total));
}
