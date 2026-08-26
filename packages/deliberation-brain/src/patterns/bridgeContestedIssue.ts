import type { DeliberationPattern } from '../types';

/** For contested or hostile issues: needs first, bridging proposals, then ratification. */
export const bridgeContestedIssue: DeliberationPattern = {
	patternId: 'bridgeContestedIssue',
	name: 'Bridge a contested issue',
	summary:
		'Start from what each side needs rather than from positions, converge on proposals that both sides can live with in a facilitated session, then ratify.',
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
			role: 'converge',
			engine: 'liveSession',
			questionTemplate: 'Which proposals on {{topic}} meet the needs of both sides?',
			descriptionTemplate:
				'Facilitator note: open with the highest-scoring needs from both sides, invite proposals that satisfy several of them, and let people join the proposals they can live with.',
			openNow: false,
			timing: { startAfterDays: 17 },
		},
		{
			role: 'ratify',
			engine: 'discussion',
			questionTemplate: 'Do we adopt the bridging proposals on {{topic}} that came out of the session?',
			descriptionTemplate:
				'The deciding group ratifies the proposals that crossed the divide and records what remains open.',
			openNow: false,
			timing: { startAfterDays: 19, durationDays: 7 },
		},
	],
	rationale:
		'Asking for needs instead of positions gives both sides something to rate without capitulating. The consensus score is variance-penalized: a need cheered by one camp and rejected by the other scores low, while a need both camps rate moderately positive rises to the top — without ever sorting participants into factions. Those bridging needs are the raw material the live session turns into proposals, and ratification keeps the outcome from being read as a win for one side.',
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
