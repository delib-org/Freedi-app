import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';
import {
	allTablesRating,
	countTables,
	gateBars,
	readBallot,
	readRoundPhase,
	supportPercent,
	tableTiles,
	tallyBars,
	topProposals,
	unseatedNames,
} from '../projectorLogic';

function option(id: string, consensus: number, text = id): Statement {
	return { statementId: id, statement: text, consensus } as Statement;
}

function table(n: number, step: ClassTable['step'], uids: string[] = []): ClassTable {
	return {
		tableId: `m--${n}`,
		mainId: 'm',
		n,
		memberUids: uids,
		noDeviceMembers: [],
		step,
	} as unknown as ClassTable;
}

function sub(userId: string, name: string, tableId?: string): StatementSubscription {
	return { userId, tableId, user: { displayName: name } } as unknown as StatementSubscription;
}

describe('countTables', () => {
	it('counts tables per step', () => {
		const counts = countTables([
			table(1, 'pick'),
			table(2, 'talk'),
			table(3, 'talk'),
			table(4, 'write'),
			table(5, 'rate'),
		]);
		expect(counts).toEqual({ tables: 5, picking: 1, talking: 2, writing: 1, rating: 1 });
	});

	it('detects the all-rating collapse', () => {
		expect(allTablesRating(countTables([table(1, 'rate'), table(2, 'rate')]))).toBe(true);
		expect(allTablesRating(countTables([table(1, 'rate'), table(2, 'talk')]))).toBe(false);
		expect(allTablesRating(countTables([]))).toBe(false);
	});
});

describe('tallyBars', () => {
	it('uses selections over the ballot candidates, leader fills the track', () => {
		const bars = tallyBars(['a', 'b', 'c'], { a: 2, b: 4, zzz: 9 }, [
			option('a', 0),
			option('b', 0),
		]);
		expect(bars.map((b) => b.count)).toEqual([2, 4, 0]);
		expect(bars.map((b) => b.percent)).toEqual([50, 100, 0]);
	});

	it('never divides by zero and clamps negatives', () => {
		const bars = tallyBars(['a'], { a: -1 }, []);
		expect(bars[0]).toMatchObject({ count: 0, percent: 0 });
	});
});

describe('gateBars / topProposals', () => {
	it('orders by consensus and marks the gate', () => {
		const bars = gateBars([option('a', 0.2), option('b', 0.8), option('c', 0.6)], 0.6);
		expect(bars.map((b) => b.id)).toEqual(['b', 'c', 'a']);
		expect(bars.map((b) => b.passed)).toEqual([true, true, false]);
	});

	it('keeps at most five proposals', () => {
		const many = Array.from({ length: 8 }, (_, i) => option(`o${i}`, i / 10));
		expect(topProposals(many)).toHaveLength(5);
		expect(topProposals(many)[0].statementId).toBe('o7');
	});

	it('maps support to a track position', () => {
		expect(supportPercent(-1)).toBe(0);
		expect(supportPercent(0)).toBe(50);
		expect(supportPercent(1)).toBe(100);
		expect(supportPercent(5)).toBe(100);
	});
});

describe('challenge settings readers', () => {
	it('falls back to the default gate and the write phase', () => {
		expect(readRoundPhase(undefined)).toBe('write');
		expect(readBallot({} as Statement)).toBeNull();
	});

	it('reads threshold, phase and ballot', () => {
		const q = {
			votingSettings: { threshold: 0.4 },
			statementSettings: {
				roundPhase: 'improve',
				ballot: { candidateIds: ['x'], frozenAt: 5, decisionId: 'x' },
			},
		} as unknown as Statement;
		expect(readRoundPhase(q)).toBe('improve');
		expect(readBallot(q)).toMatchObject({ candidateIds: ['x'], decisionId: 'x' });
	});
});

describe('tableTiles / unseatedNames', () => {
	it('lists member names per table and the unseated', () => {
		const roster = [sub('t', 'Teacher'), sub('u1', 'Dana', 'm--1'), sub('u2', 'Noa')];
		const tiles = tableTiles([table(1, 'pick', ['u1'])], roster);
		expect(tiles).toEqual([{ n: 1, names: ['Dana'] }]);
		expect(unseatedNames(roster, 't')).toEqual(['Noa']);
	});
});
