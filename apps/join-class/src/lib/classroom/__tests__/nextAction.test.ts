import { describe, expect, it } from 'vitest';
import type { LessonStepKey } from '@freedi/shared-types';
import { canGoBackTo, nextActionFor, notVotedCount } from '../nextAction';
import type { NextActionInput } from '../nextAction';

const STEPS: readonly LessonStepKey[] = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'allProposals',
	'vote',
	'summary',
];

const OLD_STEPS: readonly LessonStepKey[] = STEPS.filter((key) => key !== 'allProposals');

function at(stepKey: LessonStepKey, patch: Partial<NextActionInput> = {}): NextActionInput {
	const steps = patch.steps ?? STEPS;

	return {
		status: 'live',
		stepKey,
		stepIndex: steps.indexOf(stepKey),
		steps,
		hasChallenge: true,
		ballotFrozen: false,
		ballotClosed: false,
		votedCount: 0,
		presentCount: 26,
		proposalCount: 5,
		tableCount: 6,
		studentCount: 26,
		copyPending: false,
		resultsShown: false,
		...patch,
	};
}

describe('nextActionFor: every plain step opens the next one, one step at a time', () => {
	const plain: LessonStepKey[] = [
		'waiting',
		'opening',
		'side',
		'tableTalk',
		'proposals',
		'allProposals',
	];
	it.each(plain)('%s -> the step after it', (key) => {
		const spec = nextActionFor(at(key));
		expect(spec.kind).toBe('goNext');
		expect(spec.labelKey).toBe('console.next');
		expect(spec.nextIndex).toBe(STEPS.indexOf(key) + 1);
		expect(spec.nextStepKey).toBe(STEPS[STEPS.indexOf(key) + 1]);
		expect(spec.busyKey).toBe(`step:${STEPS.indexOf(key) + 1}`);
		expect(spec.busyLabelKey).toBe('console.busy_opening');
		expect(spec.blockedKey).toBeUndefined();
		expect(spec.confirm).toBeUndefined();
	});

	it('names the vote after Proposals in an old 8-step lesson', () => {
		const spec = nextActionFor(at('proposals', { steps: OLD_STEPS }));
		expect(spec.nextStepKey).toBe('vote');
	});

	it('never moves more than one step', () => {
		for (const key of STEPS) {
			const spec = nextActionFor(at(key));
			if (spec.kind === 'goNext') expect(spec.nextIndex).toBe(STEPS.indexOf(key) + 1);
		}
	});
});

describe('nextActionFor: no question to solve', () => {
	it.each(STEPS)('%s: the button is "choose the question to solve"', (key) => {
		const spec = nextActionFor(at(key, { hasChallenge: false }));
		expect(spec.kind).toBe('pickQuestion');
		expect(spec.labelKey).toBe('console.challenge.start_game');
	});
});

describe('nextActionFor: Dividing into tables', () => {
	it('split: next step', () => {
		expect(nextActionFor(at('tables')).nextStepKey).toBe('tableTalk');
	});

	it('connected, tables not brought yet: bring them from the registration', () => {
		const spec = nextActionFor(at('tables', { copyPending: true, tableCount: 0 }));
		expect(spec.kind).toBe('copySeating');
		expect(spec.labelKey).toBe('console.copy_seating');
		expect(spec.busyLabelKey).toBe('console.busy_copying');
	});

	it('no tables: divide into tables', () => {
		const spec = nextActionFor(at('tables', { tableCount: 0 }));
		expect(spec.kind).toBe('split');
		expect(spec.labelKey).toBe('console.split');
		expect(spec.busyKey).toBe('assign');
		expect(spec.blockedKey).toBeUndefined();
	});

	it('no tables and no students: the button is blocked with its reason', () => {
		const spec = nextActionFor(at('tables', { tableCount: 0, studentCount: 0 }));
		expect(spec.kind).toBe('split');
		expect(spec.blockedKey).toBe('console.blocked.no_students');
	});
});

describe('nextActionFor: Vote', () => {
	it('not open: open the vote', () => {
		const spec = nextActionFor(at('vote'));
		expect(spec.kind).toBe('openVote');
		expect(spec.labelKey).toBe('console.open_vote');
		expect(spec.busyKey).toBe('freeze');
		expect(spec.blockedKey).toBeUndefined();
	});

	it('not open and no proposals: blocked with its reason', () => {
		const spec = nextActionFor(at('vote', { proposalCount: 0 }));
		expect(spec.kind).toBe('openVote');
		expect(spec.blockedKey).toBe('console.blocked.no_proposals');
	});

	it('open, everyone voted: close the vote, no confirm', () => {
		const spec = nextActionFor(at('vote', { ballotFrozen: true, votedCount: 26 }));
		expect(spec.kind).toBe('closeVote');
		expect(spec.labelKey).toBe('console.close_vote');
		expect(spec.confirm).toBeUndefined();
	});

	it('open, 3 of 26 have not voted: close the vote asks first, naming 3', () => {
		const spec = nextActionFor(at('vote', { ballotFrozen: true, votedCount: 23 }));
		expect(spec.kind).toBe('closeVote');
		expect(spec.confirm).toEqual({ kind: 'closeVote', notVoted: 3 });
	});

	it('closed: open the next step, the summary', () => {
		const spec = nextActionFor(at('vote', { ballotFrozen: true, ballotClosed: true }));
		expect(spec.kind).toBe('goNext');
		expect(spec.nextStepKey).toBe('summary');
	});

	it('the big button alone never skips a vote that never opened', () => {
		const spec = nextActionFor(at('vote'));
		expect(spec.kind).not.toBe('goNext');
	});
});

describe('nextActionFor: Summary', () => {
	it('results hidden from the class: show to the class', () => {
		const spec = nextActionFor(at('summary'));
		expect(spec.kind).toBe('showResults');
		expect(spec.labelKey).toBe('console.close_and_go_show');
		expect(spec.busyLabelKey).toBe('console.busy_showing');
	});

	it('results shown: end the lesson', () => {
		const spec = nextActionFor(at('summary', { resultsShown: true }));
		expect(spec.kind).toBe('endLesson');
		expect(spec.labelKey).toBe('console.end');
	});
});

describe('nextActionFor: paused, open to students, ended', () => {
	it.each(STEPS)('%s paused: resume', (key) => {
		const spec = nextActionFor(at(key, { status: 'paused' }));
		expect(spec.kind).toBe('resume');
		expect(spec.labelKey).toBe('console.resume');
		expect(spec.busyKey).toBe('status:resume');
	});

	it.each(['open', 'ended'] as const)('%s: back to the plan', (status) => {
		for (const key of STEPS) {
			const spec = nextActionFor(at(key, { status }));
			expect(spec.kind).toBe('backToPlan');
			expect(spec.labelKey).toBe('teacher.back.to');
		}
	});

	it('paused wins over a missing question', () => {
		expect(nextActionFor(at('vote', { status: 'paused', hasChallenge: false })).kind).toBe(
			'resume',
		);
	});
});

describe('helpers', () => {
	it('counts students who have not voted, never below zero', () => {
		expect(notVotedCount(23, 26)).toBe(3);
		expect(notVotedCount(30, 26)).toBe(0);
	});

	it('only an earlier step can be tapped', () => {
		expect(canGoBackTo(2, 4)).toBe(true);
		expect(canGoBackTo(4, 4)).toBe(false);
		expect(canGoBackTo(5, 4)).toBe(false);
	});
});

describe('the action band always has a primary button', () => {
	const STATUSES = ['live', 'paused', 'open', 'ended'] as const;
	const cases = STEPS.flatMap((key) => STATUSES.map((status) => [key, status] as const));

	it.each(cases)('%s / %s', (key, status) => {
		for (const hasChallenge of [true, false]) {
			const spec = nextActionFor(at(key, { status, hasChallenge }));
			expect(spec.kind).toBeTruthy();
			expect(spec.labelKey).toMatch(/^[a-z]+\./);
		}
	});

	it('a connected lesson with no tables after a copy brings them again, never splits', () => {
		const spec = nextActionFor(at('tables', { tableCount: 0, connected: true }));
		expect(spec.kind).toBe('copySeating');
		expect(spec.replace).toBe(true);
		expect(nextActionFor(at('tables', { tableCount: 0 })).kind).toBe('split');
	});
});
