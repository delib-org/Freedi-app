import type { DeliberationPattern } from '../types';

/** One short crowd survey for a fast read of a team or small community. */
export const quickPulse: DeliberationPattern = {
	patternId: 'quickPulse',
	name: 'Quick pulse',
	summary: 'A single 5-day crowd survey: everyone adds an idea, everyone rates, you get a ranked list fast.',
	applicability: [
		{
			field: 'timeHorizonDays',
			max: 7,
			weight: 3,
			note: 'there is a week or less',
		},
		{
			field: 'audienceSize',
			oneOf: ['team'],
			weight: 2,
			note: 'a team-sized audience does not need a multi-stage process',
		},
		{
			field: 'desiredOutput',
			oneOf: ['ideas', 'ranking'],
			weight: 2,
			note: 'a list of ideas or a ranking is enough',
		},
	],
	sequence: [
		{
			role: 'widen',
			engine: 'crowdSurvey',
			questionTemplate: 'What is the one thing we should change first for {{topic}}?',
			descriptionTemplate: 'Add one suggestion and rate a few others. Takes about three minutes.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 5, nudgeDaysBeforeClose: 2 },
			survey: { allowParticipantsToAddSuggestions: true, minEvaluationsPerQuestion: 3 },
		},
	],
	rationale:
		'When the group is small or the clock is short, one well-framed survey gives a ranked, bridging-scored list in days; adding stages would cost more time than it adds legitimacy.',
	risks: [
		'A pulse produces a ranking, not a decision — say who acts on it.',
		'Five days is short; the nudge on day 3 matters.',
	],
	successSignals: [
		'Most of the team both suggested and rated.',
		'A clear top 3 with low disagreement.',
	],
	mainQuestionTemplate: 'What should we change first for {{topic}}?',
};
