import { describe, it, expect } from 'vitest';
import type { PartyStanceResearch, ResearchEntry } from '../../../src/lib/research';
import { checkStructure, compareScores, topChanges, statementFingerprintSource } from '../compareResearch';

const entry = (score: number): ResearchEntry => ({
	score,
	confidence: 'high',
	inferred: false,
	rationale: 'r',
	sources: [],
});
const research = (a: number[], b: number[]): PartyStanceResearch => ({
	version: 2,
	updated: 'x',
	islands: { i1: { p1: a.map(entry), p2: b.map(entry) } },
});
const islands = [{ slug: 'i1', stances: ['one', 'two'] }];

describe('compareScores', () => {
	it('computes mean |delta|, big counts and ordering', () => {
		const r = compareScores(research([0, 0], [0, 0]), research([0.5, -0.1], [0, 0]));
		const p1 = r.perParty.find((p) => p.party === 'p1');
		expect(p1?.meanAbsDelta).toBe(0.3);
		expect(p1?.bigCount).toBe(1);
		expect(topChanges(r.changes, 1)[0].delta).toBe(0.5);
	});
});

describe('checkStructure', () => {
	it('passes on identical structure and mapping', () => {
		const c = research([0, 0], [0, 0]);
		expect(checkStructure(islands, ['p1', 'p2'], c, { islands })).toEqual([]);
	});
	it('reports missing party, wrong count, wording and order mismatches', () => {
		const c = research([0], [0, 0]);
		const p = checkStructure(islands, ['p1', 'p2', 'p3'], c, {
			islands: [{ slug: 'i1', stances: ['two', 'one'] }],
		});
		expect(p.some((x) => x.includes('party "p3" missing'))).toBe(true);
		expect(p.some((x) => x.includes('i1/p1: 1 entries'))).toBe(true);
		expect(p.some((x) => x.includes('ORDER differs'))).toBe(true);
		const w = checkStructure(islands, ['p1', 'p2'], research([0, 0], [0, 0]), {
			islands: [{ slug: 'i1', stances: ['one', 'zzz'] }],
		});
		expect(w.some((x) => x.includes('WORDING differs'))).toBe(true);
	});
});

describe('statementFingerprintSource', () => {
	it('changes when wording changes', () => {
		expect(statementFingerprintSource(islands)).not.toBe(
			statementFingerprintSource([{ slug: 'i1', stances: ['one', 'twO'] }]),
		);
	});
});
