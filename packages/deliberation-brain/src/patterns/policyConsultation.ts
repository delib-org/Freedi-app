import type { DeliberationPattern } from '../types';

/** Public consultation on a policy: widen, refine, re-rate, decide. */
export const policyConsultation: DeliberationPattern = {
	patternId: 'policyConsultation',
	name: 'Policy consultation',
	summary:
		'A three-week open survey gathers proposals from the public, a second survey rates the refined proposals, then the deciding body decides with a public record behind it.',
	applicability: [
		{
			field: 'decisionType',
			oneOf: ['legitimize', 'prioritize'],
			weight: 3,
			note: 'the decision needs public legitimacy or public priorities',
		},
		{ field: 'audienceSize', oneOf: ['public'], weight: 3, note: 'the audience is the general public' },
		{
			field: 'desiredOutput',
			oneOf: ['decision', 'ranking'],
			weight: 1,
			note: 'a ranked and legitimate outcome is wanted',
		},
	],
	sequence: [
		{
			role: 'widen',
			engine: 'crowdSurvey',
			questionTemplate: 'What should the policy on {{topic}} include?',
			descriptionTemplate:
				'Propose what the policy should include and rate other proposals. Everything is anonymous.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 21, nudgeDaysBeforeClose: 3 },
			survey: { allowParticipantsToAddSuggestions: true, minEvaluationsPerQuestion: 3 },
		},
		{
			role: 'measure',
			engine: 'crowdSurvey',
			questionTemplate: 'How well does each refined proposal for {{topic}} serve the public?',
			descriptionTemplate:
				'The proposals below were refined from the first round. Rate each one; you cannot add new ones at this stage.',
			openNow: false,
			timing: { startAfterDays: 24, durationDays: 10, nudgeDaysBeforeClose: 3 },
			survey: { allowParticipantsToAddSuggestions: false, minEvaluationsPerQuestion: 5 },
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'Which refined proposals for {{topic}} do we adopt?',
			descriptionTemplate: 'The deciding body adopts proposals with the public ratings on the record.',
			openNow: false,
			timing: { startAfterDays: 36, durationDays: 7 },
		},
	],
	rationale:
		'Legitimacy comes from two things the public can verify: they could propose anything in round one, and the refined proposals were rated by the same public in round two. Separating the rounds keeps the final list readable and the ratings comparable.',
	risks: [
		'Refining proposals between rounds is real work for the organization; budget a few days.',
		'A public survey needs distribution — plan how people will hear about it.',
	],
	successSignals: [
		'Round one yields a broad spread of proposals, not only the organization\'s own.',
		'Round two ratings show clear separation between proposals.',
		'The decision cites the round-two ratings.',
	],
	mainQuestionTemplate: 'What should the policy on {{topic}} be?',
};
