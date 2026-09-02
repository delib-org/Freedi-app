import type { DeliberationPattern } from '../types';

/** Participatory budgeting: rank the candidates, draft the allocation proposal, comment, decide. */
export const budgetAllocation: DeliberationPattern = {
	patternId: 'budgetAllocation',
	name: 'Budget allocation',
	summary:
		'The crowd ranks what should be funded first (with the options already on the table as seeds), the Draft step writes the allocation proposal from the ranking, everyone comments on it, then the deciding group allocates.',
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
			role: 'comment',
			engine: 'document',
			questionTemplate: 'Does the allocation proposal for {{topic}} follow what we ranked, and where should it change?',
			descriptionTemplate:
				'The allocation proposal was written from the ranking. Mark each line of the proposal and comment where the split should differ.',
			openNow: false,
			timing: { durationDays: 7, nudgeDaysBeforeClose: 2 },
			draftFrom: [0],
			draftIntentTemplate:
				'Write the allocation proposal for {{topic}}: one paragraph per funded item in ranking order with the amount and the reasons given, and a gaps section for items that were ranked but not funded.',
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'How do we split the budget given what the community ranked and commented?',
			descriptionTemplate:
				'A vote in Main / the deciding group: allocate amounts starting from the proposal, explaining any departure from the ranking.',
			openNow: false,
			timing: { startAfterPrevious: 1, durationDays: 7 },
		},
	],
	rationale:
		'Allocation questions already have candidates; the crowd\'s job is to rank them with reasons, and the bridging score makes sure a candidate loved by one neighbourhood and hated by another does not top the list. Writing the allocation as a document the community can comment on turns the ranking into a proposal with numbers, and the deciding group then has a legitimate order to allocate against.',
	risks: [
		'Seeding the survey with the existing items only — leave suggestions open so a missing need can surface.',
		'Publish the allocation with the ranking beside it, or the process reads as consultation theatre.',
	],
	successSignals: [
		'Every candidate received at least 20 ratings.',
		'The allocation proposal\'s paragraphs carry positive mean agreement.',
		'The final allocation follows the ranking or explains each departure.',
	],
	mainQuestionTemplate: 'How should {{organization}} allocate the budget for {{topic}}?',
};
