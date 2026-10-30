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
import { ASSIGN_BATCH_SIZE, NONE_KEY, RETRY_BATCH_SIZE } from '../constants';
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

	it('retries missing atoms once in smaller batches, then sends the rest to NONE', async () => {
		// First pass answers only the first atom of each batch; retries answer nothing.
		callLLM.mockImplementation(async ({ user }: { user: string }) => {
			const ids = offeredLocalIds(user);
			const isRetry = ids.length <= RETRY_BATCH_SIZE;

			return JSON.stringify({ assignments: isRetry ? {} : { [ids[0]]: 't1' } });
		});

		const { assignments, unanswered } = await assignAtoms('Q', THEMES, atoms(12));

		// 1 first-pass call + ceil(11 / RETRY_BATCH_SIZE) retry calls, no third round.
		expect(callLLM).toHaveBeenCalledTimes(1 + Math.ceil(11 / RETRY_BATCH_SIZE));
		expect(assignments.get('atom0')).toBe('t1');
		expect(unanswered).toBe(11);
		expect(assignments.get('atom5')).toBe(NONE_KEY);
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
