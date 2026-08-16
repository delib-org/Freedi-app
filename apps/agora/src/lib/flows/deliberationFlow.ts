/**
 * The deliberation square as a PERSONAL cycle (the book's protocol, self-paced):
 * my proposal → weigh a few classmates' → help someone — repeated for
 * AGORA_CYCLE.ROUNDS laps. No teacher-synchronised phases; the teacher only
 * decides when the square closes.
 *
 * This is the rules of that lap, and nothing else. It knows no Mithril, no
 * Firestore, no sessionStorage — it takes a state and a patch and says what the
 * new state is and what just happened. The view reads that and does the moving
 * parts: folding the notebook, showing the splash, redrawing.
 *
 * Separated because it was 40 mutable variables deep inside a 2,899-line view,
 * where the one part of the deliberation with real rules — when a lap turns,
 * which screen a step lands you on, when the game is over — could not be tested
 * without a browser.
 */

export type CycleStep = 'mine' | 'rate' | 'help' | 'done';
export type DelibScreen = 'my' | 'results' | 'others';

export interface DeliberationCycle {
	round: number;
	step: CycleStep;
	/** Ratings given so far in this lap */
	rated: number;
}

/**
 * `done` is deliberately not splashable: the square closing is not a place you
 * walked into. Encoding that here means the view cannot be handed one.
 */
export type SplashableStep = Exclude<CycleStep, 'done'>;

export type CycleSplash =
	| { kind: 'round'; round: number }
	| { kind: 'step'; step: SplashableStep }
	| null;

/** What changed, so the view knows which of its own machinery to run. */
export interface CycleTransition {
	cycle: DeliberationCycle;
	stepChanged: boolean;
	roundChanged: boolean;
	/**
	 * Which tab this lands you on. Only set when the step changed — otherwise
	 * the student stays wherever they were looking.
	 */
	screen: DelibScreen | null;
	splash: CycleSplash;
}

export const INITIAL_CYCLE: DeliberationCycle = { round: 1, step: 'mine', rated: 0 };

/**
 * The lap's own step decides which tab you land on: the `mine` step IS the My
 * screen; everything else happens on the classmates' side.
 */
export function screenForStep(step: CycleStep): DelibScreen {
	return step === 'mine' ? 'my' : 'others';
}

/**
 * Apply a patch and report what happened.
 *
 * A new lap outranks a step change — one splash at a time, or arriving at a new
 * round would announce itself twice. `done` gets no splash: the square closing
 * is not a place you walked into.
 */
export function applyCyclePatch(
	current: DeliberationCycle,
	patch: Partial<DeliberationCycle>,
): CycleTransition {
	const roundChanged = patch.round !== undefined && patch.round !== current.round;
	const stepChanged = patch.step !== undefined && patch.step !== current.step;
	const cycle = { ...current, ...patch };

	let splash: CycleSplash = null;
	if (roundChanged) splash = { kind: 'round', round: cycle.round };
	else if (stepChanged && cycle.step !== 'done') splash = { kind: 'step', step: cycle.step };
	// The narrowing above is what makes `step` a SplashableStep here.

	return {
		cycle,
		stepChanged,
		roundChanged,
		screen: stepChanged && patch.step ? screenForStep(patch.step) : null,
		splash,
	};
}

export interface RoundAdvance extends CycleTransition {
	/** The last lap is behind us — the square is done, not turning over. */
	finished: boolean;
}

/**
 * Turn the lap over, or finish.
 *
 * `totalRounds` is passed in rather than read from constants so the rule can be
 * tested at its boundary without pretending a class runs a different game.
 */
export function advanceCycle(current: DeliberationCycle, totalRounds: number): RoundAdvance {
	if (current.round >= totalRounds) {
		return { ...applyCyclePatch(current, { step: 'done' }), finished: true };
	}

	return {
		...applyCyclePatch(current, { round: current.round + 1, step: 'mine', rated: 0 }),
		finished: false,
	};
}

/**
 * Rebuild a lap from what sessionStorage kept.
 *
 * Tolerant on purpose: a half-written or hand-edited value must put the student
 * back at the start of the game, not crash them out of it mid-lesson.
 */
export function restoreCycle(raw: string | null): DeliberationCycle {
	if (!raw) return { ...INITIAL_CYCLE };
	try {
		const stored = JSON.parse(raw) as Partial<DeliberationCycle>;
		const cycle = { ...INITIAL_CYCLE, ...stored };

		return {
			round: Number.isFinite(cycle.round) && cycle.round >= 1 ? Math.floor(cycle.round) : 1,
			step: (['mine', 'rate', 'help', 'done'] as CycleStep[]).includes(cycle.step)
				? cycle.step
				: 'mine',
			rated: Number.isFinite(cycle.rated) && cycle.rated >= 0 ? Math.floor(cycle.rated) : 0,
		};
	} catch {
		return { ...INITIAL_CYCLE };
	}
}
