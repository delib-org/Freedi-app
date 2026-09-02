import {
	ChallengeDiagnosis,
	STUDIO_NUDGE_MESSAGE_MAX,
	STUDIO_PLAN_MAX_ACTIVITIES,
	StudioPlan,
	StudioPlanActivity,
	STUDIO_SEED_OPTIONS_COUNT,
} from '@freedi/shared-types';

export interface CriticReport {
	problems: string[];
	blocking: boolean;
}

export interface CriticContext {
	now: number;
	diagnosis?: ChallengeDiagnosis;
}

/** Comfortable upper bound; more than this is a warning, > MAX is blocking. */
export const RECOMMENDED_MAX_ACTIVITIES = 5;

const EN_QUESTION_OPENERS =
	/^(what|how|which|where|when|who|whom|whose|why|should|could|would|do|does|did|is|are|can|will|shall)\b/i;

export function looksLikeOpenQuestion(title: string): boolean {
	const trimmed = title.trim();

	return trimmed.includes('?') || EN_QUESTION_OPENERS.test(trimmed);
}

function countQuestionMarks(title: string): number {
	return (title.match(/\?/g) ?? []).length;
}

function label(activity: StudioPlanActivity): string {
	return `${activity.tempId} "${activity.title}"`;
}

/** Playbook grammar checks (comment before converge, close with a decision). */
function critiqueSequence(activities: readonly StudioPlanActivity[], problems: string[]): void {
	const firstOpening = activities.findIndex(
		(activity) => activity.role === 'widen' || activity.role === 'measure',
	);
	const firstDecide = activities.findIndex((activity) => activity.role === 'decide');
	if (firstDecide >= 0 && firstOpening >= 0 && firstDecide < firstOpening) {
		problems.push(
			`Activity ${label(activities[firstDecide])} decides before any widen/measure stage; put the decision after the input stages.`,
		);
	}

	const firstLive = activities.findIndex((activity) => activity.type === 'liveSession');
	const firstInput = activities.findIndex(
		(activity) => activity.type === 'document' || activity.type === 'crowdSurvey',
	);
	if (firstLive >= 0 && (firstInput < 0 || firstLive < firstInput)) {
		problems.push(
			`Activity ${label(activities[firstLive])} is a live session before any document or crowd survey; comment before converging — the room should work on gaps the public exposed, not on a blank page.`,
		);
	}

	const last = activities[activities.length - 1];
	if (activities.length > 1 && last && last.role !== 'decide' && last.role !== 'ratify') {
		problems.push(
			`The process ends with ${label(last)} (${last.role ?? 'no role'}) instead of a decision; close with a "decide" discussion — a vote in Main / the assembly.`,
		);
	}
}

/**
 * Deterministic hygiene rules over a normalized plan. Blocking problems mean
 * the plan must not be built as-is; the rest are advice for the next turn.
 */
export function critiquePlan(plan: StudioPlan, ctx: CriticContext): CriticReport {
	const problems: string[] = [];
	const blocking: string[] = [];
	const activities = plan.activities;

	// 1. Activity count.
	if (activities.length === 0) {
		blocking.push('The plan has no activities; a plan needs 1–5 activities.');
	} else if (activities.length > STUDIO_PLAN_MAX_ACTIVITIES) {
		blocking.push(
			`The plan has ${activities.length} activities; the maximum is ${STUDIO_PLAN_MAX_ACTIVITIES}.`,
		);
	}
	activities
		.filter((activity) => activity.type === 'crowdSurvey' && activity.change === 'add')
		.forEach((activity) => {
			const seeds = activity.survey?.seedOptions?.length ?? 0;
			if (seeds < STUDIO_SEED_OPTIONS_COUNT) {
				problems.push(
					`Crowd survey ${label(activity)} has ${seeds} starting suggestions; seed ${STUDIO_SEED_OPTIONS_COUNT} so the first participants have something to rate.`,
				);
			}
		});
	if (activities.length > RECOMMENDED_MAX_ACTIVITIES) {
		problems.push(
			`The plan has ${activities.length} activities; ${RECOMMENDED_MAX_ACTIVITIES} or fewer keeps participants engaged. Consider merging stages.`,
		);
	}

	// 2. Every activity is one open question.
	for (const activity of activities) {
		if (!looksLikeOpenQuestion(activity.title)) {
			problems.push(`Activity ${label(activity)} should be phrased as one open question for participants.`);
		}
		if (countQuestionMarks(activity.title) > 1) {
			problems.push(`Activity ${label(activity)} looks double-barreled; ask one question per activity.`);
		}
	}

	// 3. Audience fits the engines.
	const audience = ctx.diagnosis?.audienceSize;
	if (activities.length > 0) {
		const onlyDiscussion = activities.every((activity) => activity.type === 'discussion');
		if ((audience === 'public' || audience === 'community') && onlyDiscussion) {
			problems.push(
				`The audience is ${audience}-sized but every activity is a discussion; a crowd survey reaches many more people.`,
			);
		}
		if (audience === 'team' && activities.some((activity) => activity.type === 'crowdSurvey')) {
			problems.push(
				'The audience is a team; a crowd survey works but a discussion may give the team a deeper conversation.',
			);
		}
	}

	// 4. The playbook grammar.
	critiqueSequence(activities, problems);

	// 5–9. Scheduled actions.
	const byTempId = new Map(activities.map((activity) => [activity.tempId, activity]));
	const openAt = new Map<string, number>();
	const draftAt = new Map<string, number>();
	for (const action of plan.scheduledActions) {
		const targetKey = action.activityTempId ?? action.statementId ?? '';
		if (action.at < ctx.now) {
			blocking.push(`Scheduled ${action.action} (${action.tempId}) is in the past${action.atLocal ? ` (${action.atLocal})` : ''}.`);
		}
		if (action.action === 'open') {
			const target = action.activityTempId ? byTempId.get(action.activityTempId) : undefined;
			if (target?.openNow) {
				problems.push(
					`Scheduled open (${action.tempId}) targets ${label(target)} which already opens now; drop the action or set openNow=false.`,
				);
			}
			const previous = openAt.get(targetKey);
			if (previous === undefined || action.at < previous) openAt.set(targetKey, action.at);
		}
		if (action.action === 'draft') {
			const previous = draftAt.get(targetKey);
			if (previous === undefined || action.at > previous) draftAt.set(targetKey, action.at);
		}
		if (action.action === 'nudge') {
			const message = action.nudgeMessage?.trim() ?? '';
			if (!message) {
				problems.push(`Scheduled nudge (${action.tempId}) has no message; write a warm reminder of ≤ ${STUDIO_NUDGE_MESSAGE_MAX} characters.`);
			} else if (message.length > STUDIO_NUDGE_MESSAGE_MAX) {
				problems.push(`Scheduled nudge (${action.tempId}) message is ${message.length} characters; the maximum is ${STUDIO_NUDGE_MESSAGE_MAX}.`);
			}
		}
	}
	for (const action of plan.scheduledActions) {
		const targetKey = action.activityTempId ?? action.statementId ?? '';
		if (action.action === 'close') {
			const opensAt = openAt.get(targetKey);
			if (opensAt !== undefined && action.at <= opensAt) {
				problems.push(`Scheduled close (${action.tempId}) runs before the open of the same activity (${targetKey}).`);
			}
		}
		if (action.action === 'open') {
			const draftsAt = draftAt.get(targetKey);
			if (draftsAt !== undefined && action.at <= draftsAt) {
				blocking.push(
					`Scheduled open (${action.tempId}) of document ${targetKey} runs before its draft step; the draft must be written and reviewed before the document opens.`,
				);
			}
		}
	}

	return { problems: [...blocking, ...problems], blocking: blocking.length > 0 };
}
