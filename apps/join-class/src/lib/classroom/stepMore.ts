import type { LessonStatus, LessonStepKey } from '@freedi/shared-types';

/**
 * What "More for this step" holds at each step (design 6.2), as pure data: which items, in which
 * order, and which red ones go last. An empty menu is not drawn at all. The view
 * (StepMore.ts) turns each key into a control.
 */

export type StepMoreItem =
	| 'seats'
	| 'updateFromRegistration'
	| 'manageRegistration'
	| 'voteScope'
	| 'voteScopeLocked'
	| 'voteOrder'
	| 'resultsAudience'
	| 'supportAudience'
	| 'pauseVote'
	| 'skipVote'
	| 'allTablesRate'
	| 'anotherTurnAll'
	| 'plenum';

export type StepMoreDanger = 'resplit' | 'resetTurns' | 'resetVote';

export interface StepMoreInput {
	status: LessonStatus;
	stepKey: LessonStepKey;
	hasTables: boolean;
	hasChallenge: boolean;
	/** The lesson uses a registration: its tables come from there. */
	connected: boolean;
	/** Connected, and the tables were copied once: "update from the registration" is offered. */
	canUpdateFromRegistration: boolean;
	ballotFrozen: boolean;
	ballotClosed: boolean;
}

export interface StepMoreContent {
	items: readonly StepMoreItem[];
	/** Red items: always last, after a divider, and they ask before they act. */
	danger: readonly StepMoreDanger[];
}

const NOTHING: StepMoreContent = { items: [], danger: [] };

function tablesContent(input: StepMoreInput): StepMoreContent {
	if (input.connected) {
		return {
			items: [
				...(input.canUpdateFromRegistration ? (['updateFromRegistration'] as const) : []),
				'manageRegistration',
			],
			danger: [],
		};
	}

	return { items: ['seats'], danger: input.hasTables ? ['resplit'] : [] };
}

function voteContent(input: StepMoreInput): StepMoreContent {
	if (!input.hasChallenge) return NOTHING;
	if (input.ballotClosed) {
		return { items: ['voteOrder', 'resultsAudience'], danger: ['resetVote'] };
	}
	if (input.ballotFrozen) {
		return {
			items: ['pauseVote', 'voteOrder', 'resultsAudience', 'voteScopeLocked'],
			danger: ['resetVote'],
		};
	}

	return { items: ['voteScope', 'voteOrder', 'resultsAudience', 'skipVote'], danger: [] };
}

/** The items of the current step's menu. Ended and open lessons have none. */
export function stepMoreContent(input: StepMoreInput): StepMoreContent {
	if (input.status === 'ended' || input.status === 'open') return NOTHING;
	switch (input.stepKey) {
		case 'tables':
			return tablesContent(input);
		case 'tableTalk':
			return input.hasTables ? { items: [], danger: ['resetTurns'] } : NOTHING;
		case 'proposals':
			return { items: ['allTablesRate', 'anotherTurnAll', 'plenum'], danger: [] };
		case 'vote':
			return voteContent(input);
		case 'summary':
			return input.hasChallenge
				? { items: ['resultsAudience', 'supportAudience'], danger: [] }
				: NOTHING;
		default:
			return NOTHING;
	}
}

/** The menu is drawn only when it holds something. */
export function hasStepMore(input: StepMoreInput): boolean {
	const content = stepMoreContent(input);

	return content.items.length + content.danger.length > 0;
}
