/**
 * Tests for useStatementColor hook
 *
 * The ink (color) is derived from the header accent's luminance via
 * getHeaderContrastInk: light accents (option yellow, question blue, group
 * purple) get the dark ink token, dark accents (home blue) keep the light ink.
 * In jsdom custom properties don't resolve, so derivation runs on the var()
 * fallbacks, which mirror the token values in _variables.scss.
 */

import { renderHook, act } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import useStatementColor from '../useStatementColor';
import { HEADER_INK_ON_DARK, HEADER_INK_ON_LIGHT } from '@/utils/headerContrast';

describe('useStatementColor', () => {
	const baseStatement: Partial<Statement> = {
		statementId: 'stmt-123',
		statement: 'Test statement',
		createdAt: Date.now(),
		lastUpdate: Date.now(),
	};

	describe('initial state', () => {
		it('should return default style for undefined statement', () => {
			const { result } = renderHook(() => useStatementColor({ statement: undefined }));

			expect(result.current).toEqual({
				backgroundColor: 'var(--header-home, #5f88e5)',
				// White passes the 3:1 icon bar on the home blue, so the
				// classic light ink is preserved.
				color: HEADER_INK_ON_DARK,
			});
		});
	});

	describe('statement type styling', () => {
		it('should return group style with dark ink (light purple accent)', async () => {
			const statement = {
				...baseStatement,
				statementType: StatementType.group,
			} as Statement;

			const { result, rerender } = renderHook(
				({ stmt }) => useStatementColor({ statement: stmt }),
				{ initialProps: { stmt: statement } },
			);

			await act(async () => {
				rerender({ stmt: statement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-group, #b9a1e8)');
			expect(result.current.color).toBe(HEADER_INK_ON_LIGHT);
		});

		it('should return option style with dark ink (light yellow accent)', async () => {
			const statement = {
				...baseStatement,
				statementType: StatementType.option,
			} as Statement;

			const { result, rerender } = renderHook(
				({ stmt }) => useStatementColor({ statement: stmt }),
				{ initialProps: { stmt: statement } },
			);

			await act(async () => {
				rerender({ stmt: statement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-not-chosen, #ffe16a)');
			expect(result.current.color).toBe(HEADER_INK_ON_LIGHT);
		});

		it('should return question style with dark ink (light blue accent)', async () => {
			const statement = {
				...baseStatement,
				statementType: StatementType.question,
			} as Statement;

			const { result, rerender } = renderHook(
				({ stmt }) => useStatementColor({ statement: stmt }),
				{ initialProps: { stmt: statement } },
			);

			await act(async () => {
				rerender({ stmt: statement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-question, #47b4ef)');
			expect(result.current.color).toBe(HEADER_INK_ON_LIGHT);
		});

		it('should return default style for statement type', async () => {
			const statement = {
				...baseStatement,
				statementType: StatementType.statement,
			} as Statement;

			const { result, rerender } = renderHook(
				({ stmt }) => useStatementColor({ statement: stmt }),
				{ initialProps: { stmt: statement } },
			);

			await act(async () => {
				rerender({ stmt: statement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-home, #5f88e5)');
			expect(result.current.color).toBe(HEADER_INK_ON_DARK);
		});
	});

	describe('statement changes', () => {
		it('should update style when statement type changes', async () => {
			const optionStatement = {
				...baseStatement,
				statementType: StatementType.option,
			} as Statement;

			const questionStatement = {
				...baseStatement,
				statementType: StatementType.question,
			} as Statement;

			const { result, rerender } = renderHook(
				({ stmt }) => useStatementColor({ statement: stmt }),
				{ initialProps: { stmt: optionStatement } },
			);

			await act(async () => {
				rerender({ stmt: optionStatement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-not-chosen, #ffe16a)');

			await act(async () => {
				rerender({ stmt: questionStatement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-question, #47b4ef)');
		});

		it('should reset to default when statement becomes undefined', async () => {
			const statement = {
				...baseStatement,
				statementType: StatementType.option,
			} as Statement;

			const { result, rerender } = renderHook(
				({ stmt }) => useStatementColor({ statement: stmt }),
				{ initialProps: { stmt: statement as Statement | undefined } },
			);

			await act(async () => {
				rerender({ stmt: statement });
			});

			expect(result.current.backgroundColor).toBe('var(--header-not-chosen, #ffe16a)');

			await act(async () => {
				rerender({ stmt: undefined });
			});

			expect(result.current.backgroundColor).toBe('var(--header-home, #5f88e5)');
		});
	});

	describe('return type', () => {
		it('should return StyleProps interface', () => {
			const { result } = renderHook(() => useStatementColor({ statement: undefined }));

			// Check that result matches StyleProps interface
			expect(result.current).toHaveProperty('backgroundColor');
			expect(result.current).toHaveProperty('color');
			expect(typeof result.current.backgroundColor).toBe('string');
			expect(typeof result.current.color).toBe('string');
		});
	});
});
