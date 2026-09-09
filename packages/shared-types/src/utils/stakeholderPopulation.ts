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
 * Nothing declares this per option. A deliberation declares its stakeholders
 * once, on the group or the question, and every option beneath inherits it.
 * This module is the single place that walk happens, so the server trigger,
 * the recalculation tools and the client all agree on N by construction.
 *
 * When nobody has declared a number, N falls back to the people who have
 * actually VOTED in this question or in a question above it — never to the
 * subscriber count. Subscribing is what a browser does on your behalf the
 * moment you open a page (see useAuthorization's auto-subscribe), so member
 * counts measure traffic; a deliberation with 15 subscribers and 2 voters has
 * an electorate of 2, and calling it 15 quietly reports a 13% turnout the
 * process never actually had.
 *
 * Leaving it undeclared everywhere with nobody having voted is valid and means
 * "no bounded stakeholder set" — open participation, unknown population —
 * which yields the uncorrected formula. That is the safe default, and it is
 * why every accessor here returns `undefined` rather than guessing.
 */

/**
 * The minimum a statement must look like to take part in the walk. Structural
 * on purpose: callers pass raw Firestore data, parsed Statements, or Redux
 * state without converting.
 */
export interface StakeholderScope {
	evaluationSettings?: { targetPopulation?: number; samplingQuality?: number } | undefined;
	/**
	 * Questions only: distinct people who have evaluated something under this
	 * question or a question above it. Maintained server-side by
	 * functions/src/progress/chainVoters.ts.
	 */
	evaluation?: { chainEvaluators?: number | undefined } | undefined;
}

/** Where the resolved N came from — surface this, never just the number */
export type StakeholderSource = 'self' | 'parent' | 'top' | 'parentVoters' | 'topVoters';

export interface StakeholderResolution {
	/** N, or undefined when no bounded stakeholder set is known */
	count?: number;
	/** Which level supplied it. Undefined exactly when `count` is undefined. */
	source?: StakeholderSource;
	/** True when N was inferred from who voted rather than declared by a human */
	inferred: boolean;
}

const NOT_RESOLVED: StakeholderResolution = { inferred: false };

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

function voters(scope?: StakeholderScope): number | undefined {
	return validCount(scope?.evaluation?.chainEvaluators);
}

/**
 * Resolve N for a statement from its own settings and its ancestors.
 *
 * Order, most specific first:
 *   1. self         — this statement overrides everything
 *   2. parent       — the question it belongs to
 *   3. top          — the group or deliberation it belongs to
 *   4. parentVoters — who has voted in that question, or in one above it
 *   5. topVoters    — the same reading taken at the top, as a floor
 *
 * A human declaration at ANY level beats a count inferred from turnout,
 * because turnout answers "who showed up" and a stakeholder count answers
 * "who this decision is about" — the same number only by coincidence. An
 * inferred N therefore always UNDERSTATES the stakeholder body, and a smaller
 * N raises the corrected score, so `inferred` travels with the number and
 * every surface that shows it should say where it came from.
 *
 * The inferred rungs read from the PARENT, not from self. Self is typically
 * the option being voted on, and `chainEvaluators` is a question-level fact:
 * the option's electorate is everyone deliberating the question, not only the
 * subset that reached this one option. Rung 5 exists for the moment before the
 * parent's count has been written for the first time; it is a lower bound on
 * rung 4 (the chain at the parent contains the top's voters), never a
 * contradiction of it.
 */
export function resolveStakeholderCount(
	self?: StakeholderScope,
	parent?: StakeholderScope,
	top?: StakeholderScope,
): StakeholderResolution {
	const selfDeclared = declared(self);
	if (selfDeclared !== undefined) {
		return { count: selfDeclared, source: 'self', inferred: false };
	}

	const parentDeclared = declared(parent);
	if (parentDeclared !== undefined) {
		return { count: parentDeclared, source: 'parent', inferred: false };
	}

	const topDeclared = declared(top);
	if (topDeclared !== undefined) {
		return { count: topDeclared, source: 'top', inferred: false };
	}

	const parentVoters = voters(parent);
	if (parentVoters !== undefined) {
		return { count: parentVoters, source: 'parentVoters', inferred: true };
	}

	const topVoters = voters(top);
	if (topVoters !== undefined) {
		return { count: topVoters, source: 'topVoters', inferred: true };
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
