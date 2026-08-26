import type { DeliberationPattern } from '../types';

/** The generic default: gather widely, converge in a room, decide in a small group. */
export const widenConvergeDecide: DeliberationPattern = {
	patternId: 'widenConvergeDecide',
	name: 'Widen → converge → decide',
	summary:
		'Collect and rate ideas from the whole community, bring the leading ideas into a live session to converge, then let the deciding group settle it.',
	applicability: [
		{
			field: 'decisionType',
			oneOf: ['gatherIdeas', 'prioritize', 'choose'],
			weight: 2,
			note: 'the challenge is about gathering, prioritizing or choosing',
		},
		{
			field: 'audienceSize',
			oneOf: ['community', 'public'],
			weight: 2,
			note: 'a community-sized or public audience benefits from a crowd stage',
		},
		{
			field: 'facilitationCapacity',
			oneOf: ['canRunRoom'],
			weight: 1,
			note: 'someone can facilitate the live session',
		},
	],
	sequence: [
		{
			role: 'widen',
			engine: 'crowdSurvey',
			questionTemplate: 'What would make the biggest difference for {{topic}}?',
			descriptionTemplate:
				'Share one concrete idea, then rate other people\'s ideas. The most widely supported ideas move on to the next stage.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 14, nudgeDaysBeforeClose: 3 },
			survey: { allowParticipantsToAddSuggestions: true, minEvaluationsPerQuestion: 3 },
		},
		{
			role: 'converge',
			engine: 'liveSession',
			questionTemplate: 'Which of the leading ideas for {{topic}} can we unite behind?',
			descriptionTemplate:
				'A facilitated session where participants join the proposals they support and merge similar ones.',
			openNow: false,
			timing: { startAfterDays: 16 },
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'What do we decide to do about {{topic}}, and who owns the next step?',
			descriptionTemplate: 'The deciding group weighs the converged proposals and records the decision.',
			openNow: false,
			timing: { startAfterDays: 18, durationDays: 7 },
		},
	],
	rationale:
		'A crowd stage first makes sure the decision starts from the real spread of ideas rather than the loudest voices; a live session turns a ranked list into a few proposals people actually own; a short decision discussion keeps the deciding group accountable to what the crowd said.',
	risks: [
		'If the live session is skipped, the crowd ranking may be read as the decision.',
		'A 14-day survey needs at least one reminder or participation tails off after the first week.',
	],
	successSignals: [
		'At least a third of those who entered the survey rated ideas.',
		'The live session ends with 2–4 proposals rather than a long list.',
		'The decision references the top-rated crowd ideas.',
	],
	mainQuestionTemplate: 'How should {{organization}} move forward on {{topic}}?',
};
