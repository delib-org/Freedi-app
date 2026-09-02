import type { DeliberationPattern } from '../types';

/**
 * Question-first agreement (the Rotem process): nothing is written yet → a crowd
 * survey generates the material → the Draft step writes a proposal from the
 * top suggestions → public comment → revised draft → vote in Main.
 */
export const questionFirstAgreement: DeliberationPattern = {
	patternId: 'questionFirstAgreement',
	name: 'Question-first agreement',
	summary:
		'Nothing is written yet: the community answers one open question in a crowd survey, the Draft step turns the top suggestions into a proposal, everyone comments on it paragraph by paragraph, a revised draft goes out for last corrections, and the decision is taken in a vote.',
	applicability: [
		{ field: 'hasDraft', oneOf: ['nothing'], weight: 4, note: 'nothing is written yet — the community must generate the material' },
		{
			field: 'decisionType',
			oneOf: ['gatherIdeas', 'legitimize', 'prioritize'],
			weight: 2,
			note: 'ideas, priorities or legitimacy are what is needed',
		},
		{
			field: 'facilitationCapacity',
			oneOf: ['none'],
			weight: 1,
			note: 'no room is available, so the agreement forms asynchronously',
		},
	],
	sequence: [
		{
			role: 'widen',
			engine: 'crowdSurvey',
			questionTemplate: 'How should we handle {{topic}}?',
			descriptionTemplate:
				'Share one concrete suggestion, then rate other people\'s suggestions. The most widely supported ones become the first draft of our agreement.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 14, nudgeDaysBeforeClose: 3 },
			survey: { allowParticipantsToAddSuggestions: true, minEvaluationsPerQuestion: 3 },
		},
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'What in the proposed agreement on {{topic}} works, and what is missing?',
			descriptionTemplate:
				'This proposal was written from the suggestions you rated highest. Mark how much you agree with each paragraph and comment where it falls short.',
			openNow: false,
			timing: { durationDays: 10, nudgeDaysBeforeClose: 3 },
			draftFrom: [0],
			draftIntentTemplate:
				'Write a proposed agreement on {{topic}} from the top suggestions: cluster them into sections, keep provenance, and list the open gaps.',
		},
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'Are there last corrections to the revised agreement on {{topic}}?',
			descriptionTemplate:
				'The comments were folded into this revised text. Read it in your own time and mark what still needs correcting.',
			openNow: false,
			timing: { durationDays: 5, nudgeDaysBeforeClose: 2 },
			draftFrom: [1],
			draftIntentTemplate:
				'Revise the agreement on {{topic}} from the paragraph comments: keep what was agreed, rewrite the contested paragraphs, list what remains open.',
			skipWhen: { field: 'timeHorizonDays', below: 21 },
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'Do we adopt the agreement on {{topic}}?',
			descriptionTemplate:
				'A vote in Main / the assembly: the community decides with the survey ranking and the comment rounds on the record.',
			openNow: false,
			timing: { startAfterPrevious: 1, durationDays: 7 },
		},
	],
	rationale:
		'When nothing is written, a broad question to hundreds produces the material and a bridging-scored ranking of it; the Draft step is the joint that turns that ranking into a text the community can comment on. Commenting paragraph by paragraph is where the agreement forms, in everyone\'s own time and without a facilitator. The vote at the end keeps the survey and the comments as inputs to a decision, not substitutes for it.',
	risks: [
		'The survey question must be one open question about the problem, not a list of positions.',
		'The first draft is only as good as the cutoff — review it before it opens, and widen the cutoff if the top suggestions are all from one camp.',
		'With less than three weeks, skip the second comment round rather than shortening both.',
	],
	successSignals: [
		'At least a third of those who entered the survey rated suggestions.',
		'Most paragraphs of the draft carry a positive mean agreement after the first comment round.',
		'The vote passes with the revised text unchanged or lightly edited.',
	],
	mainQuestionTemplate: 'What agreement on {{topic}} can {{organization}} reach together?',
};
