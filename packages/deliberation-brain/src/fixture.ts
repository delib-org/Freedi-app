import {
	ChallengeDiagnosis,
	DEFAULT_DRAFT_CUTOFF,
	StudioPlan,
	StudioPlanActivity,
} from '@freedi/shared-types';
import { mergeDiagnosis } from './diagnosis';
import { finalizeActions, instantiateActivity, instantiatePattern, scheduleDraftedDocument } from './instantiate';
import { DEFAULT_PATTERN_ID, getPattern, questionFirstAgreement } from './patterns';
import type { BrainContext } from './types';

export interface FixtureResult {
	reply: string;
	readyToBuild: boolean;
	diagnosis: ChallengeDiagnosis;
	patternId: string;
	plan: StudioPlan;
}

/** Nothing written yet, under three weeks → survey, one drafted document, decision. */
const FIXTURE_DIAGNOSIS: ChallengeDiagnosis = {
	hasDraft: 'nothing',
	decisionType: 'gatherIdeas',
	audienceSize: 'community',
	polarization: 'low',
	facilitationCapacity: 'none',
	decisionBody: 'voteInMain',
	desiredOutput: 'agreedText',
	timeHorizonDays: 20,
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
			? `הבנתי: "${quoted}". הצעה ראשונית: סקר המונים לאיסוף ההצעות, טיוטה שנכתבת מההצעות המובילות ונפתחת להערות הציבור אחרי שתאשרו אותה, והצבעה להחלטה. כדי לדייק — האם כבר יש משהו כתוב, ומי מקבל את ההחלטה בסוף?`
			: `Got it: "${quoted}". A first sketch: a crowd survey to gather suggestions, a draft written from the top suggestions and opened for public comment once you approve it, and a vote to decide. To sharpen it — is there something written already, and who makes the final call?`;
	}

	return hebrew
		? 'עדכנתי את התוכנית לפי מה שכתבת: סקר המונים של שבועיים, טיוטה שנכתבת שעה אחרי סגירתו ונפתחת להערות יומיים אחרי הבדיקה שלך, והצבעה להחלטה אחריה. שאבנה את זה?'
		: 'I updated the plan from what you wrote: a two-week crowd survey, a draft written an hour after it closes and opened for comment two days later once you have reviewed it, and a vote to decide after that. Shall I build this?';
}

/** Keeps every existing row and adds one document drafted from the first existing activity. */
function withSeedOptions(plan: StudioPlan, ctx: BrainContext): StudioPlan {
	const hebrew = ctx.languageName === 'Hebrew';
	const seeds = hebrew
		? ['להקים ועדת תושבים שתלווה את התהליך', 'לפרסם את כל המידע הרלוונטי לציבור מראש', 'לקיים סיור משותף בשטח לפני ההחלטה', 'לתקצב פיילוט קטן לפני מהלך מלא', 'להגדיר מדדי הצלחה ולבדוק אותם אחרי שנה', 'לשמור על ערוץ פניות פתוח לאורך כל הדרך']
		: ['Set up a residents committee to accompany the process', 'Publish all relevant information to the public in advance', 'Hold a joint site visit before the decision', 'Fund a small pilot before a full rollout', 'Define success measures and review them after a year', 'Keep an open channel for requests throughout'];

	return {
		...plan,
		activities: plan.activities.map((activity) =>
			activity.type === 'crowdSurvey'
				? { ...activity, survey: { ...(activity.survey ?? {}), seedOptions: seeds } }
				: activity,
		),
	};
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
	const template = questionFirstAgreement.sequence[1];
	const document = instantiateActivity(template, 'a1', kept.length, ctx);
	const sources = rows.slice(0, 1).map((row) => row.statementId);
	if (sources.length > 0) {
		document.draftFrom = sources;
		document.draftCutoff = { ...DEFAULT_DRAFT_CUTOFF };
		document.openNow = false;
	} else {
		document.openNow = true;
	}
	const placed = sources.length > 0 ? scheduleDraftedDocument('a1', sources, [], template.timing, ctx) : undefined;

	return {
		mainQuestion: base.mainQuestion,
		activities: [...kept, document],
		scheduledActions: placed ? finalizeActions(placed.actions, ctx.timezone) : [],
		summary: base.summary,
	};
}

/**
 * Deterministic stand-in for the LLM (tests, emulator, demos). First user
 * turn → plan + one clarifying question, readyToBuild false; later turns →
 * the same plan, readyToBuild true.
 */
export function buildFixtureResponse(ctx: BrainContext, userMessage: string): FixtureResult {
	const pattern = (ctx.patternId ? getPattern(ctx.patternId) : undefined) ?? questionFirstAgreement;
	const diagnosis = mergeDiagnosis(FIXTURE_DIAGNOSIS, ctx.diagnosis);
	const first = ctx.userTurns === 0;
	const basePlan = instantiatePattern(pattern, { ...ctx, diagnosis });
	const seeded = withSeedOptions(basePlan, ctx);
	const plan = ctx.mode === 'existing' ? existingModePlan(seeded, ctx) : seeded;

	return {
		reply: replyFor(ctx, userMessage, first),
		readyToBuild: !first,
		diagnosis,
		patternId: pattern.patternId ?? DEFAULT_PATTERN_ID,
		plan,
	};
}
