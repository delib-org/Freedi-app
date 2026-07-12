import {
	judgeSemanticEquivalence,
	EquivalencePair,
	EquivalenceVerdict,
} from '../semantic-equivalence-service';

const mockGenerateContent = jest.fn();

jest.mock('../../config/gemini', () => ({
	getGeminiModel: jest.fn(() => ({
		generateContent: mockGenerateContent,
	})),
}));

function geminiResponse(items: Array<{ pairIndex: number; verdict: string; reason?: string }>) {
	return {
		response: {
			text: () => JSON.stringify(items),
		},
	};
}

function pair(id: string, a: string, b: string): EquivalencePair {
	return { pairId: id, textA: a, textB: b };
}

describe('semantic-equivalence-service', () => {
	beforeEach(() => {
		mockGenerateContent.mockReset();
	});

	describe('judgeSemanticEquivalence', () => {
		it('returns empty array for empty input without calling the LLM', async () => {
			const result = await judgeSemanticEquivalence([]);
			expect(result).toEqual([]);
			expect(mockGenerateContent).not.toHaveBeenCalled();
		});

		it('returns the four verdicts for hand-crafted pairs', async () => {
			mockGenerateContent.mockResolvedValueOnce(
				geminiResponse([
					{ pairIndex: 1, verdict: 'same', reason: 'paraphrase' },
					{ pairIndex: 2, verdict: 'opposite', reason: 'cut vs boost' },
					{ pairIndex: 3, verdict: 'related', reason: 'competing priorities' },
					{ pairIndex: 4, verdict: 'different', reason: 'unrelated' },
				]),
			);

			const pairs: EquivalencePair[] = [
				pair('p1', 'Increase the budget for public transit', 'Boost public transit funding'),
				pair('p2', 'Increase the budget for public transit', 'Cut public transit funding'),
				pair('p3', 'Prioritize economic growth', 'Prioritize environmental protection'),
				pair('p4', 'Add a third lane to highway 5', 'Establish a new community garden'),
			];

			const results = await judgeSemanticEquivalence(pairs);

			expect(results).toHaveLength(4);
			const byId = Object.fromEntries(results.map((r) => [r.pairId, r]));
			expect(byId.p1.verdict).toBe<EquivalenceVerdict>('same');
			expect(byId.p2.verdict).toBe<EquivalenceVerdict>('opposite');
			expect(byId.p3.verdict).toBe<EquivalenceVerdict>('related');
			expect(byId.p4.verdict).toBe<EquivalenceVerdict>('different');
			for (const r of results) {
				expect(r.reason.length).toBeGreaterThan(0);
			}
		});

		it('batches at 20 pairs per LLM call', async () => {
			const pairs: EquivalencePair[] = Array.from({ length: 50 }, (_, i) =>
				pair(`p${i}`, `Proposal A${i}`, `Proposal B${i}`),
			);

			let callIndex = 0;
			mockGenerateContent.mockImplementation(() => {
				const start = callIndex * 20;
				const end = Math.min(start + 20, 50);
				const items: Array<{ pairIndex: number; verdict: string; reason: string }> = [];
				for (let i = start; i < end; i++) {
					items.push({
						pairIndex: i - start + 1,
						verdict: 'same',
						reason: 'mock',
					});
				}
				callIndex++;

				return Promise.resolve(geminiResponse(items));
			});

			const results = await judgeSemanticEquivalence(pairs);

			expect(mockGenerateContent).toHaveBeenCalledTimes(3);
			expect(results).toHaveLength(50);
			expect(new Set(results.map((r) => r.pairId)).size).toBe(50);
		});

		it('strips markdown fences from the model response', async () => {
			mockGenerateContent.mockResolvedValueOnce({
				response: {
					text: () => '```json\n[{"pairIndex": 1, "verdict": "same", "reason": "test"}]\n```',
				},
			});

			const results = await judgeSemanticEquivalence([pair('p1', 'A text', 'B text')]);

			expect(results).toEqual([{ pairId: 'p1', verdict: 'same', reason: 'test' }]);
		});

		it('extracts JSON when the model wraps it in prose', async () => {
			mockGenerateContent.mockResolvedValueOnce({
				response: {
					text: () =>
						'Sure! Here is the array:\n\n[{"pairIndex": 1, "verdict": "related", "reason": "topical"}]\n\nLet me know if you need more.',
				},
			});

			const results = await judgeSemanticEquivalence([pair('p1', 'A text', 'B text')]);

			expect(results[0].verdict).toBe<EquivalenceVerdict>('related');
		});

		it('falls back to "different" for missing verdicts in a batch', async () => {
			mockGenerateContent.mockResolvedValueOnce(
				geminiResponse([
					{ pairIndex: 1, verdict: 'same', reason: 'ok' },
					// pairIndex 2 omitted by the model
					{ pairIndex: 3, verdict: 'opposite', reason: 'ok' },
				]),
			);

			const results = await judgeSemanticEquivalence([
				pair('p1', 'A1', 'B1'),
				pair('p2', 'A2', 'B2'),
				pair('p3', 'A3', 'B3'),
			]);

			const byId = Object.fromEntries(results.map((r) => [r.pairId, r]));
			expect(byId.p1.verdict).toBe<EquivalenceVerdict>('same');
			expect(byId.p2.verdict).toBe<EquivalenceVerdict>('different');
			expect(byId.p2.reason).toMatch(/no verdict/i);
			expect(byId.p3.verdict).toBe<EquivalenceVerdict>('opposite');
		});

		it('falls back to "different" for an entire batch on LLM failure', async () => {
			mockGenerateContent.mockRejectedValueOnce(new Error('Gemini quota exceeded'));

			const results = await judgeSemanticEquivalence([
				pair('p1', 'A1', 'B1'),
				pair('p2', 'A2', 'B2'),
			]);

			expect(results).toHaveLength(2);
			for (const r of results) {
				expect(r.verdict).toBe<EquivalenceVerdict>('different');
				expect(r.reason).toMatch(/failed/i);
			}
		});

		it('falls back to "different" when JSON is unparseable', async () => {
			mockGenerateContent.mockResolvedValueOnce({
				response: {
					text: () => 'I am not going to answer in JSON, sorry.',
				},
			});

			const results = await judgeSemanticEquivalence([pair('p1', 'A1', 'B1')]);

			expect(results[0].verdict).toBe<EquivalenceVerdict>('different');
		});

		it('normalizes verdict synonyms returned by the model', async () => {
			mockGenerateContent.mockResolvedValueOnce(
				geminiResponse([
					{ pairIndex: 1, verdict: 'duplicate', reason: 'r1' },
					{ pairIndex: 2, verdict: 'paraphrase', reason: 'r2' },
					{ pairIndex: 3, verdict: 'contradictory', reason: 'r3' },
					{ pairIndex: 4, verdict: 'similar', reason: 'r4' },
				]),
			);

			const results = await judgeSemanticEquivalence([
				pair('p1', 'a', 'b'),
				pair('p2', 'a', 'b'),
				pair('p3', 'a', 'b'),
				pair('p4', 'a', 'b'),
			]);

			const byId = Object.fromEntries(results.map((r) => [r.pairId, r]));
			expect(byId.p1.verdict).toBe<EquivalenceVerdict>('same');
			expect(byId.p2.verdict).toBe<EquivalenceVerdict>('same');
			expect(byId.p3.verdict).toBe<EquivalenceVerdict>('opposite');
			expect(byId.p4.verdict).toBe<EquivalenceVerdict>('related');
		});

		it('drops out-of-range pairIndex values', async () => {
			mockGenerateContent.mockResolvedValueOnce(
				geminiResponse([
					{ pairIndex: 1, verdict: 'same', reason: 'r1' },
					{ pairIndex: 99, verdict: 'same', reason: 'fake' },
				]),
			);

			const results = await judgeSemanticEquivalence([pair('p1', 'a', 'b')]);

			expect(results).toHaveLength(1);
			expect(results[0].pairId).toBe('p1');
		});
	});
});
