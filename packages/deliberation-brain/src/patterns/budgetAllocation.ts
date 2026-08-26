import type { DeliberationPattern } from '../types';

/** Participatory budgeting: rank the funding candidates, then decide. */
export const budgetAllocation: DeliberationPattern = {
	patternId: 'budgetAllocation',
	name: 'Budget allocation',
	summary:
		'The crowd ranks what should be funded first (with the options already on the table as seeds), then the deciding group allocates.',
	applicability: [
		{ field: 'decisionType', oneOf: ['allocate'], weight: 5, note: 'money or resources must be split' },
		{ field: 'existingOptions', weight: 1, note: 'candidate items already exist to seed the survey' },
		{
			field: 'audienceSize',
			oneOf: ['community', 'public'],
			weight: 1,
			note: 'those who pay or benefit are many',
		},
	],
	sequence: [
		{
			role: 'widen',
			engine: 'crowdSurvey',
			questionTemplate: 'Which of these should we fund first, and why?',
			descriptionTemplate:
				'Rate the funding candidates and, if something important is missing, add it with a short reason.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 10, nudgeDaysBeforeClose: 3 },
			survey: { allowParticipantsToAddSuggestions: true, minEvaluationsPerQuestion: 5 },
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'How do we split the budget given what the community ranked highest?',
			descriptionTemplate:
				'The deciding group allocates amounts, starting from the ranked list and explaining any departure from it.',
			openNow: false,
			timing: { startAfterDays: 12, durationDays: 7 },
		},
	],
	rationale:
		'Allocation questions already have candidates; the crowd\'s job is to rank them with reasons, and the bridging score makes sure a candidate loved by one neighbourhood and hated by another does not top the list. The deciding group then has a legitimate order to allocate against.',
	risks: [
		'Seeding the survey with the existing items only — leave suggestions open so a missing need can surface.',
		'Publish the allocation with the ranking beside it, or the process reads as consultation theatre.',
	],
	successSignals: [
		'Every candidate received at least 20 ratings.',
		'The final allocation follows the ranking or explains each departure.',
	],
	mainQuestionTemplate: 'How should {{organization}} allocate the budget for {{topic}}?',
};
