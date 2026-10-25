import { describe, expect, it } from 'vitest';
import { LessonStepKey, Role } from '@freedi/shared-types';
import type { ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';
import {
	clearsTableClocksOnEnter,
	forwardControl,
	formatClock,
	formatSpeakerTime,
	gateRows,
	isBallotClosed,
	isBallotFrozen,
	isBallotPaused,
	isPlenum,
	railSteps,
	rosterStudents,
	tableStepKey,
	tablesAreDone,
	timerLine,
	unplacedStudents,
} from '../consoleHelpers';

const KEYS: LessonStepKey[] = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'vote',
	'summary',
];

function opt(id: string, consensus: number | undefined, extra: Partial<Statement> = {}): Statement {
	return { statementId: id, statement: `text ${id}`, consensus, ...extra } as Statement;
}

function table(extra: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: [],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...extra,
	};
}

describe('rail state', () => {
	it('marks done, current and upcoming', () => {
		const steps = railSteps(KEYS, 3);
		expect(steps.map((s) => s.state)).toEqual([
			'done',
			'done',
			'done',
			'current',
			'upcoming',
			'upcoming',
			'upcoming',
			'upcoming',
		]);
	});

	it('forward control opens the next step, then ends the lesson', () => {
		expect(forwardControl(0, 8)).toEqual({ kind: 'next', nextIndex: 1 });
		expect(forwardControl(6, 8)).toEqual({ kind: 'next', nextIndex: 7 });
		expect(forwardControl(7, 8)).toEqual({ kind: 'end' });
	});

	it('formats the lesson clock and the speaker time', () => {
		expect(formatClock(12 * 60_000 + 40_000)).toBe('00:12:40');
		expect(formatClock(-5)).toBe('00:00:00');
		expect(formatSpeakerTime(42_000)).toBe('0:42');
		expect(formatSpeakerTime(60_000)).toBe('1:00');
	});
});

describe('gate maths', () => {
	it('sorts by consensus, marks passed and gives the remaining gap', () => {
		const rows = gateRows([opt('a', 0.48), opt('b', 0.7), opt('c', undefined)], 0.6);
		expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
		expect(rows[0]).toMatchObject({ passed: true, gap: 0 });
		expect(rows[1]).toMatchObject({ passed: false, gap: 0.12 });
		expect(rows[2]).toMatchObject({ consensus: 0, gap: 0.6 });
	});

	it('hides hidden options and clamps the fill', () => {
		const rows = gateRows([opt('a', 1.4), opt('h', 0.9, { hide: true })], 0.6);
		expect(rows).toHaveLength(1);
		expect(rows[0].fill).toBe(1);
	});

	it('reads plenum and ballot flags', () => {
		const q = (settings: object): Statement => ({ statementSettings: settings }) as Statement;
		expect(isPlenum(q({ roundPhase: 'improve' }))).toBe(true);
		expect(isPlenum(q({ roundPhase: 'write' }))).toBe(false);
		expect(isBallotFrozen(q({ ballot: { frozenAt: 1 } }))).toBe(true);
		expect(isBallotClosed(q({ ballot: { frozenAt: 1 } }))).toBe(false);
		expect(isBallotClosed(q({ ballot: { frozenAt: 1, closedAt: 2 } }))).toBe(true);
		expect(isBallotPaused(q({ ballot: { frozenAt: 1 } }))).toBe(false);
		expect(isBallotPaused(q({ ballot: { frozenAt: 1, pausedAt: 2 } }))).toBe(true);
	});
});

describe('tablesAreDone', () => {
	it('is true once the class votes or reads the summary, false while the tables still work', () => {
		expect(tablesAreDone('vote')).toBe(true);
		expect(tablesAreDone('summary')).toBe(true);
		for (const key of ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals'] as const) {
			expect(tablesAreDone(key)).toBe(false);
		}
	});
});

describe('roster', () => {
	const sub = (uid: string, role: Role, extra: object = {}): StatementSubscription =>
		({ userId: uid, role, user: { displayName: `n-${uid}` }, ...extra }) as StatementSubscription;

	it('drops admins, derives camp from side and finds the unplaced', () => {
		const students = rosterStudents([
			sub('t', Role.admin),
			sub('a', Role.member, { side: 10 }),
			sub('b', Role.member, { camp: 'b', tableId: 'm--1' }),
		]);
		expect(students.map((s) => s.uid)).toEqual(['a', 'b']);
		expect(students[0].camp).toBe('a');
		const unplaced = unplacedStudents(students, [table({ memberUids: ['b'] })]);
		expect(unplaced.map((s) => s.uid)).toEqual(['a']);
	});
});

describe('table timer line', () => {
	it('is none outside the talk step or without a clock', () => {
		expect(timerLine(table({ step: 'write', speakerUid: 'u' }), 1000, 60_000).kind).toBe('none');
		expect(timerLine(table({ speakerUid: 'u' }), null, 60_000).kind).toBe('none');
	});

	it('runs, then is over in words', () => {
		const running = timerLine(table({ speakerUid: 'u' }), 30_000, 60_000);
		expect(running).toMatchObject({ kind: 'running', fraction: 0.5 });
		expect(timerLine(table({ speakerUid: 'u' }), 0, 60_000).kind).toBe('over');
	});

	it('names the now line, plenum overrides', () => {
		expect(tableStepKey(table({ step: 'rate' }), false)).toBe('console.now_rate');
		expect(tableStepKey(table({ step: 'rate' }), true)).toBe('console.now_plenum');
	});
});

describe('clearsTableClocksOnEnter', () => {
	const proposals = KEYS.indexOf('proposals');

	it('clears the table clocks when Proposals opens from an earlier step', () => {
		expect(clearsTableClocksOnEnter(KEYS.indexOf('tableTalk'), proposals, KEYS)).toBe(true);
	});

	it('leaves the tables alone when coming back from Vote or moving elsewhere', () => {
		expect(clearsTableClocksOnEnter(KEYS.indexOf('vote'), proposals, KEYS)).toBe(false);
		expect(clearsTableClocksOnEnter(proposals, KEYS.indexOf('vote'), KEYS)).toBe(false);
	});
});
