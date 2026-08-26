import type { DeliberationPattern } from '../types';

/** Leadership drafts directions, the whole organization rates them, leadership decides. */
export const visionStrategy: DeliberationPattern = {
	patternId: 'visionStrategy',
	name: 'Vision and strategy',
	summary:
		'The leadership team widens the options in a discussion, the whole organization rates them in a crowd survey, and leadership decides with that reading in hand.',
	applicability: [
		{
			field: 'decisionType',
			oneOf: ['choose', 'prioritize'],
			weight: 2,
			note: 'a direction must be chosen or priorities set',
		},
		{
			field: 'audienceSize',
			oneOf: ['team', 'community'],
			weight: 2,
			note: 'an organization-sized audience with a leadership core',
		},
		{ field: 'desiredOutput', oneOf: ['decision'], weight: 2, note: 'a decision is expected at the end' },
	],
	sequence: [
		{
			role: 'widen',
			engine: 'discussion',
			questionTemplate: 'What strategic directions should {{organization}} consider for {{topic}}?',
			descriptionTemplate:
				'Leadership team only: propose and discuss candidate directions. Aim for 4–7 clearly different options.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 7 },
		},
		{
			role: 'measure',
			engine: 'crowdSurvey',
			questionTemplate: 'Which of these directions for {{topic}} would you stand behind?',
			descriptionTemplate:
				'Rate each direction the leadership team proposed, and add one if something important is missing.',
			openNow: false,
			timing: { startAfterDays: 9, durationDays: 14, nudgeDaysBeforeClose: 3 },
			survey: { allowParticipantsToAddSuggestions: true, minEvaluationsPerQuestion: 4 },
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'Which direction for {{topic}} do we commit to, and what do we stop doing?',
			descriptionTemplate:
				'Leadership decides with the organization-wide ratings on the table and records the trade-offs.',
			openNow: false,
			timing: { startAfterDays: 25, durationDays: 7 },
		},
	],
	rationale:
		'Strategy options need a small group to draft them well, but a strategy nobody in the organization stands behind fails in execution. Rating the drafted directions across the whole organization before the decision surfaces both support and hidden disagreement, and the bridging score favors directions the organization can unite on.',
	risks: [
		'If leadership rates too, the survey measures leadership twice — share it with everyone else.',
		'Directions that are too similar produce a flat ranking; insist on real alternatives in stage one.',
	],
	successSignals: [
		'Stage one produces 4–7 distinct directions.',
		'A large share of the organization rates in stage two.',
		'The chosen direction is in the top two by consensus score.',
	],
	mainQuestionTemplate: 'What direction should {{organization}} take on {{topic}}?',
};
