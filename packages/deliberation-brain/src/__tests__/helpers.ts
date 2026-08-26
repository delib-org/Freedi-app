import type { StudioPlan, StudioPlanActivity, StudioPlanScheduledAction } from '@freedi/shared-types';
import type { BrainContext } from '../types';
import { isoDateInTimezone } from '../time';

export const TZ = 'Asia/Jerusalem';
export const NOW = Date.now();
export const DAY_MS = 24 * 60 * 60 * 1000;

export function makeCtx(overrides: Partial<BrainContext> = {}): BrainContext {
	return {
		mode: 'new',
		languageName: 'English',
		todayIso: isoDateInTimezone(NOW, TZ),
		timezone: TZ,
		organizationName: 'Northern District Council',
		userTurns: 0,
		...overrides,
	};
}

export function futureIso(days: number, hour = 9): string {
	const date = new Date(NOW + days * DAY_MS);
	date.setUTCHours(hour, 0, 0, 0);

	return date.toISOString().replace('.000Z', '+00:00');
}

export function activity(overrides: Partial<StudioPlanActivity> & { tempId: string }): StudioPlanActivity {
	return {
		type: 'crowdSurvey',
		title: 'What should we improve first?',
		order: 0,
		openNow: true,
		change: 'add',
		...overrides,
	};
}

export function action(
	overrides: Partial<StudioPlanScheduledAction> & { tempId: string },
): StudioPlanScheduledAction {
	return {
		activityTempId: 'a1',
		action: 'close',
		at: NOW + 10 * DAY_MS,
		...overrides,
	};
}

export function plan(overrides: Partial<StudioPlan> = {}): StudioPlan {
	return {
		mainQuestion: { title: 'How should we improve the park?' },
		activities: [activity({ tempId: 'a1', role: 'widen' })],
		scheduledActions: [],
		summary: 'One survey.',
		...overrides,
	};
}
