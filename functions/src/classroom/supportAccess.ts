import { DEFAULT_GATE } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

/**
 * Who may read "support by side", and against which gate. Shared by
 * classRegistrationSupport (a registration's positions) and classSupportBySide
 * (the lesson's own Side step). Both answer with totals only.
 */

/** The lesson steps at which support by side is on a screen (projector Vote / Summary, the phones' Summary). */
export const SUPPORT_STEPS: ReadonlySet<string> = new Set(['vote', 'summary']);

function finiteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The gate the Summary compares support with: the challenge's, else the lesson's, else DEFAULT_GATE. */
export function gateOf(challenge: Statement, main: Statement): number {
	return (
		finiteNumber(challenge.votingSettings?.threshold) ??
		finiteNumber(main.votingSettings?.threshold) ??
		DEFAULT_GATE
	);
}

/** A student sees support by side only when the teacher shows it to everyone. */
export function supportShownToAll(challenge: Statement): boolean {
	const display = challenge.statementSettings?.voteDisplay;

	return display?.liveResults === true && display?.supportShown === true;
}

/**
 * The lesson stands at a step that shows support by side (a lesson without a
 * plan always does). Outside those steps the totals are refused even to the
 * teacher: while students pick their sides, live per-camp counts next to the
 * live "chose a side" marks would tell her who picked which.
 */
export function supportStepOpen(main: Statement): boolean {
	const plan = main.statementSettings?.lessonPlan;
	if (!plan) return true;
	const step = plan.steps[plan.stepIndex];

	return typeof step === 'string' && SUPPORT_STEPS.has(step);
}
