jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const logError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => logError(...args),
}));

jest.mock('../verdict-cache-service', () => ({
	judgeSemanticEquivalenceCached: jest.fn(),
}));

import { judgeAutoMerge, type AutoMergeJudge } from '../auto-merge-gate';
import type { EquivalenceVerdict } from '../semantic-equivalence-service';

const input = {
	newText: 'Improve dialogue between residents',
	targetText: 'Improve public landscaping, paths and shade',
	targetStatementId: 't1',
	questionId: 'q1',
	userId: 'u1',
};

const judgeSaying =
	(verdict: EquivalenceVerdict): AutoMergeJudge =>
	async (pairs) =>
		pairs.map((p) => ({ pairId: p.pairId, verdict, reason: 'because' }));

beforeEach(() => jest.clearAllMocks());

describe('judgeAutoMerge', () => {
	it('allows the merge when the judge says same', async () => {
		const judge = jest.fn(judgeSaying('same'));
		const decision = await judgeAutoMerge(input, judge);

		expect(decision).toEqual({ allowed: true, verdict: 'same', reason: 'because' });
		expect(judge).toHaveBeenCalledWith([
			{ pairId: 'automerge|t1', textA: input.newText, textB: input.targetText },
		]);
	});

	it.each<EquivalenceVerdict>(['related', 'different', 'opposite'])(
		'refuses the merge when the judge says %s',
		async (verdict) => {
			const decision = await judgeAutoMerge(input, judgeSaying(verdict));

			expect(decision.allowed).toBe(false);
			expect(decision.verdict).toBe(verdict);
		},
	);

	it('refuses and logs when the judge throws', async () => {
		const judge: AutoMergeJudge = async () => {
			throw new Error('gemini down');
		};
		const decision = await judgeAutoMerge(input, judge);

		expect(decision).toMatchObject({ allowed: false, verdict: 'judge-error' });
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'autoMergeGate.judgeAutoMerge', statementId: 't1' }),
		);
	});

	it('refuses and logs when the judge times out', async () => {
		const judge: AutoMergeJudge = () => new Promise(() => undefined);
		const decision = await judgeAutoMerge(input, judge, 5);

		expect(decision).toMatchObject({ allowed: false, verdict: 'judge-error' });
		expect(decision.reason).toMatch(/timed out/);
		expect(logError).toHaveBeenCalled();
	});

	it('refuses when the judge returns no verdict', async () => {
		const decision = await judgeAutoMerge(input, async () => []);

		expect(decision).toMatchObject({ allowed: false, verdict: 'judge-error' });
	});

	it('refuses without calling the judge when a text is empty', async () => {
		const judge = jest.fn(judgeSaying('same'));
		const decision = await judgeAutoMerge({ ...input, targetText: '  ' }, judge);

		expect(decision.allowed).toBe(false);
		expect(judge).not.toHaveBeenCalled();
	});
});
