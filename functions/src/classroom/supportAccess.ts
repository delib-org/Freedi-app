import { DEFAULT_GATE, sidesLocked } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

/**
 * Who may read "support by side", and against which gate. Shared by
 * classRegistrationSupport (a registration's positions) and classSupportBySide
 * (the lesson's own Side step). Both answer with totals only.
 */

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
 * The lesson stands at a step that shows support by side (Vote, Summary). Those
 * are exactly the steps at which the rules freeze every side (sidesLocked), so a
 * late pick or a change can never move a total the teacher is watching; before
 * them the totals are refused even to her, since per-camp counts next to the
 * live "chose a side" marks would tell her who picked which. A lesson without a
 * plan never reaches these steps on the phones and gets no totals.
 */
export function supportStepOpen(main: Statement): boolean {
	return sidesLocked(main.statementSettings?.lessonPlan);
}
