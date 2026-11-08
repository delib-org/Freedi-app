import { Statement } from '@freedi/shared-types';
import { selectTopAgreements, formatConsensusPercent, getConsensusScore } from '../topAgreements';

type Evaluation = Statement['evaluation'];

const make = (id: string, over: Partial<Statement> = {}): Statement =>
  ({ statementId: id, statement: `text ${id}`, ...over }) as Statement;

describe('topAgreements', () => {
  it('sorts by evaluation.agreement descending', () => {
    const rows = selectTopAgreements(
      [
        make('a', { evaluation: { agreement: 0.2, numberOfEvaluators: 5 } as Evaluation }),
        make('b', { evaluation: { agreement: 0.8, numberOfEvaluators: 3 } as Evaluation }),
      ],
      10
    );

    expect(rows.map((r) => r.statementId)).toEqual(['b', 'a']);
    expect(rows[0].numberOfEvaluators).toBe(3);
  });

  it('falls back to legacy consensus and then 0', () => {
    expect(getConsensusScore(make('a', { consensus: 0.4 }))).toBe(0.4);
    expect(getConsensusScore(make('b'))).toBe(0);
  });

  it('breaks ties by evaluator count', () => {
    const rows = selectTopAgreements(
      [
        make('a', { evaluation: { agreement: 0.5, numberOfEvaluators: 2 } as Evaluation }),
        make('b', { evaluation: { agreement: 0.5, numberOfEvaluators: 9 } as Evaluation }),
      ],
      10
    );

    expect(rows[0].statementId).toBe('b');
  });

  it('drops hidden statements and applies the limit', () => {
    const rows = selectTopAgreements(
      [
        make('a', { consensus: 0.9, hide: true }),
        make('b', { consensus: 0.5 }),
        make('c', { consensus: 0.1 }),
      ],
      1
    );

    expect(rows.map((r) => r.statementId)).toEqual(['b']);
  });

  it('handles empty input and negative limit', () => {
    expect(selectTopAgreements([], 5)).toEqual([]);
    expect(selectTopAgreements([make('a')], -1)).toEqual([]);
  });

  it('formats percent', () => {
    expect(formatConsensusPercent(0.624)).toBe(62);
    expect(formatConsensusPercent(-0.5)).toBe(-50);
  });
});
