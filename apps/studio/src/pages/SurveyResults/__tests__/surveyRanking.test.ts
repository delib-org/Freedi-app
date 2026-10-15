import { describe, it, expect } from 'vitest';
import { StatementType, type Statement } from '@freedi/shared-types';
import { buildQuestionResults, rankOptions, scoreToPercent } from '../surveyRanking';

function stmt(patch: Partial<Statement> & { statementId: string }): Statement {
	return {
		statement: patch.statementId,
		statementType: StatementType.option,
		parentId: 'q1',
		consensus: 0,
		...patch,
	} as Statement;
}

describe('rankOptions', () => {
	it('sorts by consensus, then by evaluators', () => {
		const ranked = rankOptions([
			stmt({ statementId: 'low', consensus: 0.1 }),
			stmt({ statementId: 'top', consensus: 0.8 }),
			stmt({
				statementId: 'tieMore',
				consensus: 0.5,
				evaluation: { numberOfEvaluators: 9 } as Statement['evaluation'],
			}),
			stmt({
				statementId: 'tieLess',
				consensus: 0.5,
				evaluation: { numberOfEvaluators: 2 } as Statement['evaluation'],
			}),
		]);

		expect(ranked.map((o) => o.statementId)).toEqual(['top', 'tieMore', 'tieLess', 'low']);
		expect(ranked[1].evaluators).toBe(9);
	});

	it('drops hidden statements and non-options', () => {
		const ranked = rankOptions([
			stmt({ statementId: 'hidden', hide: true }),
			stmt({ statementId: 'comment', statementType: StatementType.statement }),
			stmt({ statementId: 'ok' }),
		]);

		expect(ranked.map((o) => o.statementId)).toEqual(['ok']);
	});

	it('treats missing consensus and evaluation as zero', () => {
		const [only] = rankOptions([stmt({ statementId: 'a', consensus: undefined })]);

		expect(only.score).toBe(0);
		expect(only.evaluators).toBe(0);
	});
});

describe('buildQuestionResults', () => {
	it("keeps the survey's question order and groups options by parent", () => {
		const results = buildQuestionResults(
			['q2', 'q1'],
			[
				stmt({ statementId: 'q1', statement: 'First' }),
				stmt({ statementId: 'q2', statement: 'Second' }),
			],
			[stmt({ statementId: 'a', parentId: 'q1' }), stmt({ statementId: 'b', parentId: 'q2' })],
		);

		expect(results.map((r) => r.title)).toEqual(['Second', 'First']);
		expect(results[0].options.map((o) => o.statementId)).toEqual(['b']);
	});
});

describe('scoreToPercent', () => {
	it('rounds to a whole percentage', () => {
		expect(scoreToPercent(0.426)).toBe(43);
		expect(scoreToPercent(-0.5)).toBe(-50);
	});
});
