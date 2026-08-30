import type { DeliberationPattern } from '../types';

/**
 * For contested or hostile issues: needs first, a draft of bridging proposals,
 * public comment, a room that converges on what both sides can live with,
 * a revised draft, and ratification.
 */
export const bridgeContestedIssue: DeliberationPattern = {
	patternId: 'bridgeContestedIssue',
	name: 'Bridge a contested issue',
	summary:
		'Start from what each side needs rather than from positions, draft bridging proposals from the needs both sides rate highly, let everyone comment, converge in a facilitated session on proposals both sides can live with, revise, then ratify.',
	applicability: [
		{
			field: 'polarization',
			oneOf: ['contested', 'hostile'],
			weight: 5,
			note: 'the issue is contested or hostile',
		},
		{
			field: 'decisionType',
			oneOf: ['bridgeConflict'],
			weight: 4,
			note: 'the goal is to bridge a conflict',
		},
		{
			field: 'hasDraft',
			oneOf: ['nothing'],
			weight: 2,
			note: 'nothing is written yet, so the needs are gathered first',
		},
		{
			field: 'facilitationCapacity',
			oneOf: ['canRunRoom'],
			weight: 1,
			note: 'a facilitator is available for the live session',
		},
	],
	sequence: [
		{
			role: 'widen',
			engine: 'crowdSurvey',
			questionTemplate: 'What does each side need for a solution on {{topic}} to be acceptable?',
			descriptionTemplate:
				'Describe a need, not a position: what must be true for you to accept a solution? Then rate how important the other needs are, including the ones that are not yours.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 14, nudgeDaysBeforeClose: 3 },
			survey: {
				allowParticipantsToAddSuggestions: true,
				minEvaluationsPerQuestion: 5,
				askUserForASolutionBeforeEvaluation: true,
			},
		},
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'Which of the bridging proposals on {{topic}} can you live with, and which cannot you?',
			descriptionTemplate:
				'These proposals were written from the needs both sides rated highly. Mark each paragraph and say what would make a proposal acceptable to you.',
			openNow: false,
			timing: { durationDays: 7, nudgeDaysBeforeClose: 2 },
			draftFrom: [0],
			draftIntentTemplate:
				'Write bridging proposals on {{topic}} from the needs with high, low-variance agreement: each proposal names the needs it satisfies on both sides, and the gaps section lists the needs no proposal covers.',
		},
		{
			role: 'converge',
			engine: 'liveSession',
			questionTemplate: 'Which proposals on {{topic}} meet the needs of both sides?',
			descriptionTemplate:
				'Facilitator note: open with the proposals the comments split on, invite proposals that satisfy several needs, and let people join the proposals they can live with.',
			openNow: false,
			timing: { startAfterPrevious: 3 },
		},
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'Are there last corrections to the bridging agreement on {{topic}}?',
			descriptionTemplate:
				'The session\'s proposals were folded into this revised text. Read it in your own time and mark what you still cannot live with.',
			openNow: false,
			timing: { durationDays: 7, nudgeDaysBeforeClose: 2 },
			draftFrom: [2],
			draftIntentTemplate:
				'Revise the bridging agreement on {{topic}} with the proposals the session converged on; keep the needs each proposal satisfies visible, and list what remains open.',
		},
		{
			role: 'ratify',
			engine: 'discussion',
			questionTemplate: 'Do we adopt the bridging agreement on {{topic}}?',
			descriptionTemplate:
				'A vote in Main / the assembly: the deciding group ratifies the proposals that crossed the divide and records what remains open.',
			openNow: false,
			timing: { startAfterPrevious: 1, durationDays: 7 },
		},
	],
	rationale:
		'Asking for needs instead of positions gives both sides something to rate without capitulating. The consensus score is variance-penalized: a need cheered by one camp and rejected by the other scores low, while a need both camps rate moderately positive rises to the top — without ever sorting participants into factions. The Draft step turns those bridging needs into proposals the public can comment on, the room resolves the paragraphs that still split, and ratification keeps the outcome from being read as a win for one side.',
	risks: [
		'If the survey is framed around positions, the ranking will only mirror the split.',
		'A facilitator who lets the session become a debate loses the convergence; the note in the description is there for that reason.',
		'Minimum five ratings per need keeps single-camp brigading from lifting a partisan item.',
	],
	successSignals: [
		'The top needs have positive means and low disagreement across participants.',
		'The live session ends with proposals joined by people from more than one side.',
		'Ratification passes without a walk-out.',
	],
	mainQuestionTemplate: 'What can both sides accept on {{topic}}?',
};
