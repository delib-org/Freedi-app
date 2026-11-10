import { renderHook } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { useStableQuestion } from '../useStableQuestion';

function question(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q',
		statement: 'Which plan?',
		lastUpdate: 1,
		numberOfOptions: 40,
		statementSettings: { showEvaluation: false },
		...overrides,
	} as Statement;
}

function render(initial: Statement | undefined) {
	return renderHook(({ value }: { value: Statement | undefined }) => useStableQuestion(value), {
		initialProps: { value: initial },
	});
}

describe('useStableQuestion', () => {
	it('keeps the object when only activity counters change', () => {
		const first = question();
		const { result, rerender } = render(first);

		rerender({ value: question({ lastUpdate: 2, numberOfOptions: 41, totalEvaluators: 9 }) });

		expect(result.current).toBe(first);
	});

	it('takes the new object when a setting a card reads changes', () => {
		const { result, rerender } = render(question());
		const next = question({ statementSettings: { showEvaluation: true } } as Partial<Statement>);

		rerender({ value: next });

		expect(result.current).toBe(next);
	});

	it('takes the new object when the results change, for the card marks', () => {
		const { result, rerender } = render(question());
		const next = question({ results: [{ statementId: 'a' }] } as Partial<Statement>);

		rerender({ value: next });

		expect(result.current).toBe(next);
	});

	it('follows a question that appears and goes away', () => {
		const { result, rerender } = render(undefined);
		const first = question();

		rerender({ value: first });
		expect(result.current).toBe(first);

		rerender({ value: undefined });
		expect(result.current).toBeUndefined();
	});
});
