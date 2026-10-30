jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const callLLM = jest.fn();
jest.mock('../../../config/openai-chat', () => ({
	...jest.requireActual('../../../config/openai-chat'),
	callLLM: (...args: unknown[]) => callLLM(...args),
}));

import { WORKER_MODEL } from '../../../config/openai-chat';
import { assignAtoms, parseAssignments } from '../assignAtoms';
import {
	ASSIGN_BATCH_SIZE,
	ASSIGN_RETRY_ROUNDS,
	MIN_RETRY_BATCH_SIZE,
	NONE_KEY,
	retryBatchSize,
} from '../constants';
import type { DiscoveredTheme, RebuildAtom } from '../types';

const THEMES: DiscoveredTheme[] = [
	{ key: 't1', name: 'Funding', rule: 'money' },
	{ key: 't2', name: 'Schools', rule: 'education' },
];
const atoms = (n: number): RebuildAtom[] =>
	Array.from({ length: n }, (_, i) => ({
		id: `atom${i}`,
		title: `t${i}`,
		text: `t${i}`,
		isSynth: false,
	}));

/** Ids offered in a prompt, in order: `[a1] ...` lines under PROPOSALS. */
function offeredLocalIds(user: string): string[] {
	const section = user.split('PROPOSALS:')[1] ?? '';

	return [...section.matchAll(/^\[(a\d+)\]/gm)].map((m) => m[1]);
}

beforeEach(() => jest.clearAllMocks());

describe('parseAssignments', () => {
	const local = new Map([
		['a1', 'atomX'],
		['a2', 'atomY'],
		['a3', 'atomZ'],
	]);

	it('drops invented atom ids and invented theme keys', () => {
		const raw = JSON.stringify({
			assignments: { a1: 't1', a2: 't9', a99: 't1', a3: 'none' },
		});

		const result = parseAssignments(raw, local, new Set(['t1', 't2']));

		expect([...result]).toEqual([
			['atomX', 't1'],
			['atomZ', NONE_KEY],
		]);
	});

	it('accepts ids and keys echoed in [brackets] as the prompt shows them', () => {
		const raw = JSON.stringify({ assignments: { '[a1]': '[t2]', ' a2 ': '[NONE]' } });

		const result = parseAssignments(raw, local, new Set(['t1', 't2']));

		expect([...result]).toEqual([
			['atomX', 't2'],
			['atomY', NONE_KEY],
		]);
	});

	it('rejects a response without an assignments object', () => {
		expect(() => parseAssignments('{"foo": 1}', local, new Set(['t1']))).toThrow();
	});
});

describe('assignAtoms', () => {
	it('batches on the worker model and maps short ids back to atoms', async () => {
		callLLM.mockImplementation(async ({ user }: { user: string }) =>
			JSON.stringify({
				assignments: Object.fromEntries(offeredLocalIds(user).map((id) => [id, 't2'])),
			}),
		);

		const { assignments, unanswered } = await assignAtoms(
			'Q',
			THEMES,
			atoms(ASSIGN_BATCH_SIZE + 5),
		);

		expect(callLLM).toHaveBeenCalledTimes(2);
		expect(callLLM.mock.calls[0][0].model).toBe(WORKER_MODEL);
		expect(unanswered).toBe(0);
		expect([...assignments.values()].every((k) => k === 't2')).toBe(true);
		expect(assignments.size).toBe(ASSIGN_BATCH_SIZE + 5);
	});

	it('a batch answered with unknown ids only is retried in halves and recovers', async () => {
		// First call: every id is invented. Retries: answered properly.
		const sizes: number[] = [];
		callLLM.mockImplementation(async ({ user }: { user: string }) => {
			const ids = offeredLocalIds(user);
			sizes.push(ids.length);
			const answer =
				sizes.length === 1
					? Object.fromEntries(ids.map((id) => [`x${id}`, 't1']))
					: Object.fromEntries(ids.map((id) => [id, 't2']));

			return JSON.stringify({ assignments: answer });
		});

		const { assignments, unanswered } = await assignAtoms('Q', THEMES, atoms(ASSIGN_BATCH_SIZE));

		expect(unanswered).toBe(0);
		expect([...assignments.values()].every((k) => k === 't2')).toBe(true);
		expect(sizes).toEqual([ASSIGN_BATCH_SIZE, retryBatchSize(1), retryBatchSize(1)]);
		expect(retryBatchSize(1)).toBe(ASSIGN_BATCH_SIZE / 2);
	});

	it('answers with unknown theme keys count as missing and are retried', async () => {
		callLLM
			.mockImplementationOnce(async ({ user }: { user: string }) =>
				JSON.stringify({
					assignments: Object.fromEntries(offeredLocalIds(user).map((id) => [id, 'Funding'])),
				}),
			)
			.mockImplementation(async ({ user }: { user: string }) =>
				JSON.stringify({
					assignments: Object.fromEntries(offeredLocalIds(user).map((id) => [id, NONE_KEY])),
				}),
			);

		const { assignments, unanswered } = await assignAtoms('Q', THEMES, atoms(4));

		expect(unanswered).toBe(0);
		expect([...assignments.values()]).toEqual([NONE_KEY, NONE_KEY, NONE_KEY, NONE_KEY]);
	});

	it('persistent failure ends in Other with the unanswered count set, after every halving round', async () => {
		const sizes: number[] = [];
		callLLM.mockImplementation(async ({ user }: { user: string }) => {
			const ids = offeredLocalIds(user);
			sizes.push(ids.length);

			// Only the very first atom is ever answered.
			return JSON.stringify({
				assignments: ids.includes('a1') && sizes.length === 1 ? { a1: 't1' } : {},
			});
		});

		const { assignments, unanswered } = await assignAtoms('Q', THEMES, atoms(12));

		expect(assignments.get('atom0')).toBe('t1');
		expect(unanswered).toBe(11);
		expect(assignments.get('atom11')).toBe(NONE_KEY);
		// 1 first pass + one call per retry round at the halved sizes, floored at the minimum.
		const expected = [12];
		for (let round = 1; round <= ASSIGN_RETRY_ROUNDS; round++) {
			let left = 11;
			while (left > 0) {
				expected.push(Math.min(left, retryBatchSize(round)));
				left -= retryBatchSize(round);
			}
		}
		expect(sizes).toEqual(expected);
	});

	it('halves the retry batch each round down to the minimum', () => {
		expect([1, 2, 3].map(retryBatchSize)).toEqual([20, 10, 5]);
		expect(retryBatchSize(10)).toBe(MIN_RETRY_BATCH_SIZE);
	});

	it('a retry fills what the first pass missed', async () => {
		callLLM
			.mockResolvedValueOnce('this is not json')
			.mockImplementation(async ({ user }: { user: string }) =>
				JSON.stringify({
					assignments: Object.fromEntries(offeredLocalIds(user).map((id) => [id, 't1'])),
				}),
			);

		const { assignments, unanswered } = await assignAtoms('Q', THEMES, atoms(5));

		expect(unanswered).toBe(0);
		expect([...assignments.values()]).toEqual(['t1', 't1', 't1', 't1', 't1']);
	});

	it('a failed LLM call is treated as unanswered, never as a theme', async () => {
		callLLM.mockRejectedValue(new Error('rate limited'));

		const { assignments, unanswered } = await assignAtoms('Q', THEMES, atoms(3));

		expect(unanswered).toBe(3);
		expect([...assignments.values()]).toEqual([NONE_KEY, NONE_KEY, NONE_KEY]);
	});
});
