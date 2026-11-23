import type { LessonStatus, LessonStepKey } from '@freedi/shared-types';

/**
 * The teacher console's ONE primary button as pure data (IA join-class-teacher-console 5,
 * design 2.2). Given where the lesson is and what the room is doing, it says what the button
 * is called and what it does. The step's own work comes first (vote: open it, close it,
 * only then "next step"); the button never skips work silently and never moves more than
 * one step. The view (NextAction.ts) draws it and runs it.
 */

export type NextActionKind =
	| 'pickQuestion'
	| 'goNext'
	| 'copySeating'
	| 'split'
	| 'openVote'
	| 'closeVote'
	| 'showResults'
	| 'endLesson'
	| 'resume'
	| 'backToPlan';

export interface NextActionInput {
	status: LessonStatus;
	stepKey: LessonStepKey;
	stepIndex: number;
	steps: readonly LessonStepKey[];
	/** The lesson has a question to solve. */
	hasChallenge: boolean;
	ballotFrozen: boolean;
	ballotClosed: boolean;
	/** Students with a vote / students in the room (with and without a device). */
	votedCount: number;
	presentCount: number;
	/** Proposals the vote would hold. */
	proposalCount: number;
	tableCount: number;
	studentCount: number;
	/** A connected lesson whose tables have not been brought from the registration yet. */
	copyPending: boolean;
	/** The lesson uses a registration: its tables come from there (a split is refused). */
	connected?: boolean;
	/** The class sees the vote's results. */
	resultsShown: boolean;
}

export interface NextActionSpec {
	kind: NextActionKind;
	/** i18n key of the label. For `goNext` the label takes `{ name }` = the next step's name. */
	labelKey: string;
	/** `goNext`: the step it opens. */
	nextIndex?: number;
	nextStepKey?: LessonStepKey;
	/** `copySeating`: bring the tables again (they were copied once and are gone). */
	replace?: boolean;
	/** The `isBusy` key of the write behind the button. */
	busyKey?: string;
	/** i18n key of the label while that write runs. */
	busyLabelKey?: string;
	/** Present when the button cannot work yet: the reason's i18n key. The button stays focusable. */
	blockedKey?: string;
	/** Ask first: closing a vote that some students have not voted in. */
	confirm?: { kind: 'closeVote'; notVoted: number };
}

const STATUS_LIVE: readonly LessonStatus[] = ['live'];

/** Students who are in the room and have not voted. */
export function notVotedCount(votedCount: number, presentCount: number): number {
	return Math.max(0, presentCount - votedCount);
}

function goNext(input: NextActionInput): NextActionSpec {
	const nextIndex = input.stepIndex + 1;
	if (nextIndex >= input.steps.length) return endLesson();

	return {
		kind: 'goNext',
		labelKey: 'console.next',
		nextIndex,
		nextStepKey: input.steps[nextIndex],
		busyKey: `step:${nextIndex}`,
		busyLabelKey: 'console.busy_opening',
	};
}

function endLesson(): NextActionSpec {
	return { kind: 'endLesson', labelKey: 'console.end' };
}

function tablesAction(input: NextActionInput): NextActionSpec {
	if (input.copyPending) {
		return {
			kind: 'copySeating',
			labelKey: 'console.copy_seating',
			busyKey: 'registration:copy',
			busyLabelKey: 'console.busy_copying',
		};
	}
	// Connected and the copy left no tables: bring them again, never a split (the server refuses it).
	if (input.tableCount === 0 && input.connected === true) {
		return {
			kind: 'copySeating',
			labelKey: 'console.copy_seating',
			replace: true,
			busyKey: 'registration:copy',
			busyLabelKey: 'console.busy_copying',
		};
	}
	if (input.tableCount === 0) {
		return {
			kind: 'split',
			labelKey: 'console.split',
			busyKey: 'assign',
			busyLabelKey: 'console.busy_splitting',
			blockedKey: input.studentCount === 0 ? 'console.blocked.no_students' : undefined,
		};
	}

	return goNext(input);
}

function voteAction(input: NextActionInput): NextActionSpec {
	if (input.ballotClosed) return goNext(input);
	if (!input.ballotFrozen) {
		return {
			kind: 'openVote',
			labelKey: 'console.open_vote',
			busyKey: 'freeze',
			busyLabelKey: 'console.busy_opening',
			blockedKey: input.proposalCount < 1 ? 'console.blocked.no_proposals' : undefined,
		};
	}
	const notVoted = notVotedCount(input.votedCount, input.presentCount);

	return {
		kind: 'closeVote',
		labelKey: 'console.close_vote',
		busyKey: 'close',
		busyLabelKey: 'console.busy_closing',
		confirm: notVoted > 0 ? { kind: 'closeVote', notVoted } : undefined,
	};
}

function summaryAction(input: NextActionInput): NextActionSpec {
	if (!input.resultsShown) {
		return {
			kind: 'showResults',
			labelKey: 'console.close_and_go_show',
			busyKey: 'voteDisplay:liveResults',
			busyLabelKey: 'console.busy_showing',
		};
	}

	return endLesson();
}

/** The one primary action for the console's current moment. */
export function nextActionFor(input: NextActionInput): NextActionSpec {
	if (input.status === 'paused') {
		return {
			kind: 'resume',
			labelKey: 'console.resume',
			busyKey: 'status:resume',
			busyLabelKey: 'console.busy_resuming',
		};
	}
	if (!STATUS_LIVE.includes(input.status)) {
		return { kind: 'backToPlan', labelKey: 'teacher.back.to' };
	}
	if (!input.hasChallenge) {
		return { kind: 'pickQuestion', labelKey: 'console.challenge.start_game' };
	}
	switch (input.stepKey) {
		case 'tables':
			return tablesAction(input);
		case 'vote':
			return voteAction(input);
		case 'summary':
			return summaryAction(input);
		default:
			return goNext(input);
	}
}

/** The step list's rule: only an EARLIER step can be tapped, and only to go back. */
export function canGoBackTo(stepIndex: number, currentIndex: number): boolean {
	return stepIndex < currentIndex;
}
