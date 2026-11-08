import { buildModelParams, reasoningEffortParam } from '../config/openai-chat';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('buildModelParams', () => {
	it('gives gpt-5 models a completion cap with reasoning headroom and no temperature', () => {
		expect(buildModelParams('gpt-5.6-luna', { maxTokens: 300, temperature: 0 })).toEqual({
			max_completion_tokens: 2300,
		});
	});

	it('passes reasoning effort through for gpt-5 models', () => {
		expect(buildModelParams('gpt-5.6-luna', { maxTokens: 100, reasoningEffort: 'none' })).toEqual({
			max_completion_tokens: 2100,
			reasoning_effort: 'none',
		});
		expect(buildModelParams('gpt-5.6-terra', { maxTokens: 100, reasoningEffort: 'low' })).toEqual({
			max_completion_tokens: 2100,
			reasoning_effort: 'low',
		});
	});

	it('keeps legacy parameters, and no reasoning effort, for older models', () => {
		expect(
			buildModelParams('gpt-4o-mini', {
				maxTokens: 100,
				temperature: 0.4,
				reasoningEffort: 'none',
			}),
		).toEqual({ max_tokens: 100, temperature: 0.4 });
	});
});

describe('reasoningEffortParam', () => {
	it('sends "none" as-is to gpt-5.6, which rejects "minimal"', () => {
		expect(reasoningEffortParam('gpt-5.6-luna', 'none')).toBe('none');
	});

	it('translates "none" to "minimal" for the earlier gpt-5 generation, which rejects "none"', () => {
		expect(reasoningEffortParam('gpt-5-mini', 'none')).toBe('minimal');
		expect(reasoningEffortParam('gpt-5', 'none')).toBe('minimal');
	});

	it('leaves the other levels alone everywhere', () => {
		expect(reasoningEffortParam('gpt-5-mini', 'low')).toBe('low');
		expect(reasoningEffortParam('gpt-5.6-terra', 'high')).toBe('high');
	});
});
