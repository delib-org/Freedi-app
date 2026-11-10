import { TABLE_ASSIGNMENT_POSITION_STOPS } from '@freedi/shared-types';
import type { TableAssignmentPositionQuestion } from '@freedi/shared-types';

/**
 * The position question is answered on five stops, or declined. A declined
 * answer is stored as no value at all: never 50, and never drawn as the middle.
 */
export const POSITION_DECLINED = 'declined';

/** A stop's stored value (0..100), or "prefer not to answer". */
export type PositionAnswer = number | typeof POSITION_DECLINED;

const MIDDLE_STOP_INDEX = 2;
const LAST_STOP_INDEX = TABLE_ASSIGNMENT_POSITION_STOPS.length - 1;

/** The stop nearest to a stored value: older answers came from a free slider, say 37. */
export function nearestStop(value: number): number {
	return TABLE_ASSIGNMENT_POSITION_STOPS.reduce<number>(
		(best, stop) => (Math.abs(stop - value) < Math.abs(best - value) ? stop : best),
		TABLE_ASSIGNMENT_POSITION_STOPS[0],
	);
}

/** The answer a saved record shows when editing; null when the person has not answered yet. */
export function answerFromRecord(record: {
	preferences: readonly string[];
	position?: number;
}): PositionAnswer | null {
	if (record.position !== undefined) return nearestStop(record.position);

	return record.preferences.length > 0 ? POSITION_DECLINED : null;
}

/** What goes to the server: a stop's value, or nothing for a declined answer. */
export function savedPosition(answer: PositionAnswer | null): number | undefined {
	return typeof answer === 'number' ? answer : undefined;
}

/** The words for a stop: the host's pole at the ends, a template for the three between. */
export function stopLabel(
	index: number,
	question: TableAssignmentPositionQuestion,
	translate: (key: string, params?: Record<string, string>) => string,
): string {
	if (index === 0) return question.poleA;
	if (index === LAST_STOP_INDEX) return question.poleB;
	if (index === MIDDLE_STOP_INDEX) return translate('tableAssignment.position.middle');

	return translate('tableAssignment.position.leaning', {
		pole: index < MIDDLE_STOP_INDEX ? question.poleA : question.poleB,
	});
}
