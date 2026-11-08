import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { groupWrittenTexts } from '../textsHelpers';

const q = (id: string): Statement => ({ statementId: id, statement: `q ${id}` }) as Statement;
const opt = (id: string, extra: object = {}): Statement =>
	({ statementId: id, statement: `t ${id}`, ...extra }) as Statement;
const table = (n: number, nd: string[] = []): ClassTable =>
	({
		tableId: `m--${n}`,
		n,
		noDeviceMembers: nd.map((name, i) => ({ id: `${i}`, name })),
	}) as unknown as ClassTable;

describe('groupWrittenTexts', () => {
	it('groups by question then table, tables ascending, no-table last', () => {
		const groups = groupWrittenTexts(
			[
				{ question: q('g1'), challenge: false },
				{ question: q('c'), challenge: true },
			],
			new Map([
				[
					'g1',
					[
						opt('a', { classTable: { tableId: 'm--2', shared: false, coAuthors: [] } }),
						opt('b', { classTable: { tableId: 'm--1', shared: false, coAuthors: [] } }),
						opt('c'),
					],
				],
			]),
			[table(1), table(2, ['Avi'])],
		);
		expect(groups).toHaveLength(2);
		expect(groups[0].groups.map((g) => g.n)).toEqual([1, 2, null]);
		expect(groups[0].groups[1].noDeviceNames).toEqual(['Avi']);
		expect(groups[1].groups).toEqual([]);
		expect(groups[1].challenge).toBe(true);
	});

	it('orders texts by rating count and carries hidden state', () => {
		const [group] = groupWrittenTexts(
			[{ question: q('g'), challenge: false }],
			new Map([
				[
					'g',
					[
						opt('x', { evaluation: { numberOfEvaluators: 1 } }),
						opt('y', { evaluation: { numberOfEvaluators: 5 }, hide: true }),
					],
				],
			]),
			[],
		);
		expect(group.groups[0].texts.map((t) => t.id)).toEqual(['y', 'x']);
		expect(group.groups[0].texts[0].hidden).toBe(true);
		expect(group.groups[0].texts[0].ratings).toBe(5);
	});
});
