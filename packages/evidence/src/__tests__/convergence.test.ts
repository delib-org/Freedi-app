import { describe, it, expect } from 'vitest';
import { convergenceV1 } from '../convergence';
import { computeQuestionAggregates } from '../aggregates';

describe('convergence v1 (leader-gap proxy)', () => {
  it('is 0 with no options', () => {
    expect(convergenceV1.compute([])).toBe(0);
  });

  it('is C(1) with exactly one option', () => {
    expect(convergenceV1.compute([0.7])).toBeCloseTo(0.7, 6);
  });

  it('rewards a strong leader clearly ahead of the field', () => {
    const clearLeader = convergenceV1.compute([0.9, 0.2]);
    const tightRace = convergenceV1.compute([0.55, 0.5]);
    expect(clearLeader).toBeGreaterThan(tightRace);
  });

  it('stays within [0,1]', () => {
    for (const cs of [[1, 0], [0.5, 0.5, 0.5], [0.3, 0.9, 0.1]]) {
      const v = convergenceV1.compute(cs);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeQuestionAggregates', () => {
  it('returns empty aggregates with no options', () => {
    expect(computeQuestionAggregates([])).toEqual({
      optionCount: 0,
      leadingOptionId: null,
      convergenceIndex: 0,
    });
  });

  it('picks the max-C option as leader and computes convergence', () => {
    const agg = computeQuestionAggregates([
      { statementId: 'a', corroborationScore: 0.3 },
      { statementId: 'b', corroborationScore: 0.85 },
      { statementId: 'c', corroborationScore: 0.4 },
    ]);
    expect(agg.optionCount).toBe(3);
    expect(agg.leadingOptionId).toBe('b');
    expect(agg.convergenceIndex).toBeCloseTo(0.85 * (0.85 - 0.4), 6);
  });
});
