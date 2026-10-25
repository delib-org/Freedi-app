import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { ballotOptions, gateView } from '../gateLogic';

function option(id: string, consensus?: number): Statement {
	return { statementId: id, statement: id, consensus } as Statement;
}

describe('gateView', () => {
	it('stays closed when nothing reaches the gate', () => {
		const view = gateView([option('a', 0.1), option('b', -0.3)], 0.5);

		expect(view.open).toBe(false);
		expect(view.passedCount).toBe(0);
		expect(view.through).toEqual([]);
		expect(view.waiting.map((w) => w.id)).toEqual(['a', 'b']);
	});

	it('opens when an option reaches the gate exactly', () => {
		const view = gateView([option('a', 0.5), option('b', 0.2)], 0.5);

		expect(view.open).toBe(true);
		expect(view.through.map((t) => t.id)).toEqual(['a']);
		expect(view.waiting.map((w) => w.id)).toEqual(['b']);
	});

	it('reports the distance still to go, rounded to two decimals', () => {
		const view = gateView([option('a', 0.1234)], 0.5);

		expect(view.waiting[0]?.gap).toBe(0.38);
		expect(view.through).toEqual([]);
	});

	it('gives passed options a zero gap and orders them best first', () => {
		const view = gateView([option('a', 0.6), option('b', 0.9)], 0.5);

		expect(view.through.map((t) => t.id)).toEqual(['b', 'a']);
		expect(view.through.every((t) => t.gap === 0)).toBe(true);
		expect(view.passedCount).toBe(2);
	});

	it('treats a missing consensus as 0', () => {
		expect(gateView([option('a')], 0.5).waiting[0]?.gap).toBe(0.5);
		expect(gateView([option('a')], 0).open).toBe(true);
	});

	it('is closed and empty with no options', () => {
		const view = gateView([], 0.5);

		expect(view).toMatchObject({ open: false, passedCount: 0, through: [], waiting: [] });
	});
});

describe('ballotOptions', () => {
	it('keeps ballot order and drops unknown ids', () => {
		const result = ballotOptions(['b', 'x', 'a'], [option('a'), option('b')]);

		expect(result.map((o) => o.statementId)).toEqual(['b', 'a']);
	});
});
