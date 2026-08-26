import { ActivityType, type StudioActivityType } from '@freedi/shared-types';

/**
 * Vocabulary bridges for the "Start a question with AI" page: the
 * consultant-facing activity types → the engine `ActivityType`, and the
 * phases the page moves through.
 */
export { ACTION_GLYPHS, ACTION_LABELS } from '@/components/atomic/atoms/Tag';

export function toActivityType(type: StudioActivityType): ActivityType {
	switch (type) {
		case 'crowdSurvey':
			return ActivityType.massConsensus;
		case 'liveSession':
			return ActivityType.join;
		case 'discussion':
		default:
			return ActivityType.question;
	}
}

/**
 * starting  — the session is being created (existing mode: 5–20 s)
 * chatting  — the admin can type
 * waiting   — a turn is in flight
 * building  — "Build it" is running
 * built     — everything was created
 * error     — the session could not be started
 */
export type PlanPhase = 'starting' | 'chatting' | 'waiting' | 'building' | 'built' | 'error';

/** How long a turn may take before the "Still working…" hint appears. */
export const STILL_WORKING_AFTER_MS = 12_000;

/** How long a changed plan row keeps its highlight. */
export const CHANGED_FLASH_MS = 2_500;
