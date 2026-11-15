import { tableAssignmentTopicCountOf } from '@freedi/shared-types';
import type { TableAssignment } from '@freedi/shared-types';

/**
 * The participant's steps, and how many there really are (build map section
 * 4): name, then rank topics, then the position question when there is one.
 * Free mode is name, then choose a topic. A one-topic event has no topic step:
 * name, then the position question when there is one.
 */
export type ParticipantStep = 'name' | 'preferences' | 'position';

/** One topic: nobody chooses, so the topic step is skipped. */
export function isOneTopic(session: Pick<TableAssignment, 'settings'>): boolean {
	return tableAssignmentTopicCountOf(session.settings) === 'one';
}

export function stepsOf(session: Pick<TableAssignment, 'mode' | 'settings'>): ParticipantStep[] {
	const asksPosition = session.mode !== 'direct' && Boolean(session.settings.positionQuestion);

	if (isOneTopic(session)) return asksPosition ? ['name', 'position'] : ['name'];

	return asksPosition ? ['name', 'preferences', 'position'] : ['name', 'preferences'];
}

/** 1-based number of a step; 0 when this assignment does not have it. */
export function stepNumber(
	session: Pick<TableAssignment, 'mode' | 'settings'>,
	step: ParticipantStep,
): number {
	return stepsOf(session).indexOf(step) + 1;
}

/** The step after this one, or null when this is the last. */
export function nextStep(
	session: Pick<TableAssignment, 'mode' | 'settings'>,
	step: ParticipantStep,
): ParticipantStep | null {
	const steps = stepsOf(session);

	return steps[steps.indexOf(step) + 1] ?? null;
}
