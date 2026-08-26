import type {
	ChallengeDiagnosis,
	StudioPlan,
	StudioPlanActivity,
	StudioPlanScheduledAction,
} from '@freedi/shared-types';
import { mergeDiagnosis } from './diagnosis';
import { instantiatePattern } from './instantiate';
import { DEFAULT_PATTERN_ID, getPattern, widenConvergeDecide } from './patterns';
import type { BrainContext } from './types';

export interface FixtureResult {
	reply: string;
	readyToBuild: boolean;
	diagnosis: ChallengeDiagnosis;
	patternId: string;
	plan: StudioPlan;
}

const FIXTURE_DIAGNOSIS: ChallengeDiagnosis = {
	decisionType: 'gatherIdeas',
	audienceSize: 'community',
	polarization: 'low',
	facilitationCapacity: 'canRunRoom',
	desiredOutput: 'decision',
	timeHorizonDays: 25,
	confidence: { decisionType: 0.6, audienceSize: 0.6 },
};

function snippet(message: string): string {
	const clean = message.replace(/\s+/g, ' ').trim();

	return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

function replyFor(ctx: BrainContext, userMessage: string, first: boolean): string {
	const hebrew = ctx.languageName === 'Hebrew';
	const quoted = snippet(userMessage);
	if (first) {
		return hebrew
			? `הבנתי: "${quoted}". הצעה ראשונית: סקר המונים לאיסוף רעיונות, מפגש חי כדי להתכנס, ודיון קצר להחלטה. כדי לדייק — כמה אנשים אתם רוצים לשתף, ומי מקבל את ההחלטה בסוף?`
			: `Got it: "${quoted}". A first sketch: a crowd survey to gather ideas, a live session to converge, and a short discussion to decide. To sharpen it — how many people do you want to involve, and who makes the final call?`;
	}

	return hebrew
		? 'עדכנתי את התוכנית לפי מה שכתבת: סקר המונים של שבועיים, מפגש חי ביום ה-16 ודיון להחלטה אחריו. שאבנה את זה?'
		: 'I updated the plan from what you wrote: a two-week crowd survey, a live session on day 16 and a decision discussion after it. Shall I build this?';
}

function existingModePlan(base: StudioPlan, ctx: BrainContext): StudioPlan {
	const rows = ctx.existingActivities ?? [];
	const kept: StudioPlanActivity[] = rows.map((row, index) => ({
		tempId: `e${index + 1}`,
		type: row.type,
		title: row.title,
		...(row.description ? { description: row.description } : {}),
		order: index,
		openNow: row.status !== 'frozen',
		change: 'keep',
		existingStatementId: row.statementId,
	}));
	const added = base.activities.find((activity) => activity.type === 'crowdSurvey') ?? base.activities[0];
	const addedActivity: StudioPlanActivity = { ...added, tempId: 'a1', order: kept.length, change: 'add' };
	const scheduledActions: StudioPlanScheduledAction[] = base.scheduledActions
		.filter((action) => action.activityTempId === added.tempId)
		.map((action, index) => ({ ...action, tempId: `s${index + 1}`, activityTempId: 'a1' }));

	return {
		mainQuestion: base.mainQuestion,
		activities: [...kept, addedActivity],
		scheduledActions,
		summary: base.summary,
	};
}

/**
 * Deterministic stand-in for the LLM (tests, emulator, demos). First user
 * turn → plan + one clarifying question, readyToBuild false; later turns →
 * the same plan, readyToBuild true.
 */
export function buildFixtureResponse(ctx: BrainContext, userMessage: string): FixtureResult {
	const pattern = (ctx.patternId ? getPattern(ctx.patternId) : undefined) ?? widenConvergeDecide;
	const diagnosis = mergeDiagnosis(FIXTURE_DIAGNOSIS, ctx.diagnosis);
	const first = ctx.userTurns === 0;
	const basePlan = instantiatePattern(pattern, { ...ctx, diagnosis });
	const plan = ctx.mode === 'existing' ? existingModePlan(basePlan, ctx) : basePlan;

	return {
		reply: replyFor(ctx, userMessage, first),
		readyToBuild: !first,
		diagnosis,
		patternId: pattern.patternId ?? DEFAULT_PATTERN_ID,
		plan,
	};
}
