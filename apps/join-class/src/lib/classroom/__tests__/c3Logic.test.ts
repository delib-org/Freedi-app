import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement, SupportBySide } from '@freedi/shared-types';
import {
	claimLabelKey,
	countdownView,
	idleCountdownText,
	isOwnItem,
	listableItems,
	myProposal,
	officialSubstep,
	partitionRateItems,
	plenumOrder,
	resolveSubstep,
	shouldAnnounce,
	supportBars,
	supportPercent,
	TABLE_SUBSTEPS,
	tableNumberOf,
} from '../c3Logic';
import { remainingMs } from '../clockMath';

const MINUTE = 60_000;

function table(patch: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--3',
		mainId: 'm',
		n: 3,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: 'a',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...patch,
	};
}

function item(id: string, patch: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: id,
		parentId: 'q1',
		creatorId: 'x',
		createdAt: 0,
		consensus: 0,
		...patch,
	} as Statement;
}

describe('countdown maths', () => {
	it('shows m:ss above ten seconds', () => {
		expect(countdownView(MINUTE, MINUTE).text).toBe('1:00');
		expect(countdownView(34_000, MINUTE).text).toBe('0:34');
		expect(countdownView(34_000, MINUTE).warn).toBe(false);
	});

	it('rounds a partial second up, so 0:00 never shows before the end', () => {
		expect(countdownView(1, MINUTE).seconds).toBe(1);
		expect(countdownView(10_001, MINUTE).text).toBe('0:11');
	});

	it('switches to two digits and the warning colour for the last ten seconds', () => {
		const view = countdownView(9_000, MINUTE);
		expect(view.text).toBe('09');
		expect(view.warn).toBe(true);
		expect(countdownView(10_000, MINUTE).text).toBe('10');
	});

	it('is over at zero (words replace the digits) and never negative', () => {
		const view = countdownView(-500, MINUTE);
		expect(view.over).toBe(true);
		expect(view.text).toBe('');
		expect(view.fraction).toBe(0);
	});

	it('gives the bar its fraction of the interval', () => {
		expect(countdownView(30_000, MINUTE).fraction).toBe(0.5);
		expect(countdownView(2 * MINUTE, MINUTE).fraction).toBe(1);
	});

	it('reads the idle minute as 1:00', () => {
		expect(idleCountdownText(60)).toBe('1:00');
	});

	it('announces to screen readers at 10 s steps and at 10, 5, 0 only', () => {
		const heard = [60, 50, 41, 30, 12, 10, 7, 5, 3, 0].filter(shouldAnnounce);
		expect(heard).toEqual([60, 50, 30, 10, 5, 0]);
	});

	it('uses the server clock offset through remainingMs', () => {
		const endsAt = 1_000_000 + 34_000;
		// the phone is 5 s behind the server: server now = local + 5000
		expect(remainingMs(endsAt, 1_000_000 - 5_000, 5_000, { speed: 1 })).toBe(34_000);
		expect(
			countdownView(remainingMs(endsAt, 1_000_000 - 5_000, 5_000, { speed: 1 }), MINUTE).text,
		).toBe('0:34');
	});
});

describe('sub-step strip state (Proposals only)', () => {
	it('defaults to the table step; Proposals has no pick screen', () => {
		expect(officialSubstep(table({ step: 'talk' }))).toBe('talk');
		expect(officialSubstep(table({ step: 'write' }))).toBe('write');
		expect(officialSubstep(table({ step: 'pick' }))).toBe('talk');
		expect(officialSubstep(null)).toBe('talk');
	});

	it('follows a local pick while the table stays on its step', () => {
		const t = table({ step: 'talk' });
		const view = resolveSubstep(t, { step: 'write', officialAtPick: 'talk', turnAtPick: 1 });
		expect(view).toEqual({ current: 'write', official: 'talk' });
	});

	it('lapses the local pick when the table moves on or the turn changes', () => {
		const pick = { step: 'write' as const, officialAtPick: 'talk' as const, turnAtPick: 1 };
		expect(resolveSubstep(table({ step: 'write' }), pick).current).toBe('write');
		expect(resolveSubstep(table({ step: 'rate' }), pick).current).toBe('rate');
		expect(resolveSubstep(table({ step: 'talk', turn: 2 }), pick).current).toBe('talk');
	});

	it('lands on the table step without a local pick', () => {
		expect(resolveSubstep(table({ step: 'rate' }), null)).toEqual({
			current: 'rate',
			official: 'rate',
		});
	});

	it('Table talk has no strip: its sub-steps are Proposals only', () => {
		expect(Object.keys(TABLE_SUBSTEPS)).toEqual(['proposals']);
	});
});

describe('rate list', () => {
	const ctx = { uid: 'me', tableId: 'm--3', challengeId: 'ch' };

	it("never lists own items: mine, co-authored, and my table's answers", () => {
		const mine = item('mine', { creatorId: 'me' });
		const co = item('co', { classTable: { tableId: 'm--9', shared: true, coAuthors: ['me'] } });
		const tableAnswer = item('tableAnswer', {
			classTable: { tableId: 'm--3', shared: false, coAuthors: [] },
		});
		const tablemateProposal = item('tmp', {
			parentId: 'ch',
			classTable: { tableId: 'm--3', shared: false, coAuthors: [] },
		});
		const other = item('other', { classTable: { tableId: 'm--5', shared: false, coAuthors: [] } });
		expect(isOwnItem(mine, ctx)).toBe(true);
		expect(isOwnItem(co, ctx)).toBe(true);
		expect(isOwnItem(tableAnswer, ctx)).toBe(true);
		expect(isOwnItem(tablemateProposal, ctx)).toBe(false);
		const listed = listableItems(
			[mine, co, tableAnswer, tablemateProposal, other, item('h', { hide: true })],
			ctx,
		);
		expect(listed.map((s) => s.statementId)).toEqual(['tmp', 'other']);
	});

	it('orders unrated first, newest first; rated collect separately', () => {
		const items = [
			item('old', { createdAt: 1 }),
			item('new', { createdAt: 3 }),
			item('mid', { createdAt: 2 }),
			item('doneOld', { createdAt: 0 }),
			item('doneNew', { createdAt: 9 }),
		];
		const { open, rated } = partitionRateItems(items, new Set(['doneOld', 'doneNew']));
		expect(open.map((s) => s.statementId)).toEqual(['new', 'mid', 'old']);
		expect(rated.map((s) => s.statementId)).toEqual(['doneNew', 'doneOld']);
	});

	it('orders the plenum by consensus, ties newest first', () => {
		const ordered = plenumOrder([
			item('low', { consensus: 0.1 }),
			item('tieOld', { consensus: 0.5, createdAt: 1 }),
			item('high', { consensus: 0.9 }),
			item('tieNew', { consensus: 0.5, createdAt: 2 }),
		]);
		expect(ordered.map((s) => s.statementId)).toEqual(['high', 'tieNew', 'tieOld', 'low']);
	});

	it('finds my own (latest) proposal', () => {
		const found = myProposal(
			[
				item('a', { creatorId: 'me', createdAt: 1 }),
				item('b', { creatorId: 'me', createdAt: 2 }),
				item('c'),
			],
			'me',
		);
		expect(found?.statementId).toBe('b');
		expect(myProposal([item('c')], 'me')).toBeNull();
	});

	it('reads the table number from a table id', () => {
		expect(tableNumberOf('abc--5')).toBe(5);
		expect(tableNumberOf('abc')).toBeNull();
		expect(tableNumberOf(undefined)).toBeNull();
	});
});

describe('support bars', () => {
	const result: SupportBySide = {
		a: { mean: 1, n: 4, m: 5 },
		center: { mean: 0, n: 2, m: 2 },
		b: { mean: -1, n: 0, m: 3 },
		verdict: 'insufficient',
	};

	it('maps -1..+1 onto 0..100 percent', () => {
		expect(supportPercent(-1)).toBe(0);
		expect(supportPercent(0)).toBe(50);
		expect(supportPercent(1)).toBe(100);
		expect(supportPercent(0.6)).toBe(80);
		expect(supportPercent(7)).toBe(100);
	});

	it('returns the three bars in order with their counts; an empty bar stays empty', () => {
		const bars = supportBars(result);
		expect(bars.map((b) => b.camp)).toEqual(['a', 'center', 'b']);
		expect(bars.map((b) => b.percent)).toEqual([100, 50, 0]);
		expect(bars[0]).toMatchObject({ n: 4, m: 5 });
		expect(bars[2]).toMatchObject({ n: 0, m: 3 });
	});
});

describe('claimLabelKey', () => {
	it('keeps I want to answer at Table talk', () => {
		expect(claimLabelKey('tableTalk')).toBe('turn.answer');
	});

	it('says I want to propose a solution in Proposals', () => {
		expect(claimLabelKey('proposals')).toBe('turn.propose');
	});
});
