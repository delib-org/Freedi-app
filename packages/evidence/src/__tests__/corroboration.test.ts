import { describe, it, expect } from 'vitest';
import {
  baseCredibility,
  dfQuad,
  scoreNode,
  clamp01,
  DEFAULT_CORROBORATION_CONFIG,
  type ScorableStatement,
} from '../corroboration';

const cfg = DEFAULT_CORROBORATION_CONFIG;

function option(partial: Partial<ScorableStatement> = {}): ScorableStatement {
  return { id: 'opt', parentId: 'q', statementType: 'option', ...partial };
}

function evidence(
  dialecticType: 'strengthen' | 'critique',
  partial: Partial<ScorableStatement> = {},
): ScorableStatement {
  return {
    id: `ev-${Math.round((partial.prior ?? 0) * 1000)}-${dialecticType}`,
    parentId: 'opt',
    statementType: 'evidence',
    dialecticType,
    ...partial,
  };
}

describe('baseCredibility', () => {
  it('injects the per-node prior when there are no votes', () => {
    const c = baseCredibility(option({ prior: 0.9, N: 0 }), cfg);
    expect(c).toBeCloseTo(0.9, 6);
  });

  it('confidence → 0 pulls p0eff toward 0.5', () => {
    const lowConf = baseCredibility(option({ prior: 0.9, confidence: 0, N: 0 }), cfg);
    expect(lowConf).toBeCloseTo(0.5, 6);
  });

  it('κ is monotone increasing in N (votes dominate as N grows)', () => {
    const prior = 0.2;
    const voteValue = 1; // unanimous "credible" votes, each mapped to [0,1]
    const cSmall = baseCredibility(option({ prior, N: 2, sum: voteValue * 2 }), cfg);
    const cLarge = baseCredibility(option({ prior, N: 50, sum: voteValue * 50 }), cfg);
    expect(cLarge).toBeGreaterThan(cSmall);
    expect(cLarge).toBeGreaterThan(prior);
  });
});

describe('dfQuad', () => {
  it('is bounded in [0,1]', () => {
    for (const v0 of [0, 0.3, 0.7, 1]) {
      for (const S of [0, 0.5, 1]) {
        for (const A of [0, 0.5, 1]) {
          const r = dfQuad(v0, S, A);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('support raises toward 1, attack lowers toward 0', () => {
    expect(dfQuad(0.5, 0.8, 0)).toBeGreaterThan(0.5);
    expect(dfQuad(0.5, 0, 0.8)).toBeLessThan(0.5);
    expect(dfQuad(0.5, 0.3, 0.3)).toBeCloseTo(0.5, 6);
  });
});

describe('scoreNode — sibling aggregation', () => {
  it('effectiveWeight scales a child contribution', () => {
    const strong = scoreNode(
      option({ prior: 0.5, children: [evidence('strengthen', { prior: 0.9, effectiveWeight: 1 })] }),
      cfg,
    );
    const discounted = scoreNode(
      option({ prior: 0.5, children: [evidence('strengthen', { prior: 0.9, effectiveWeight: 0.1 })] }),
      cfg,
    );
    expect(strong).toBeGreaterThan(discounted);
  });

  it('independenceFactor (effectiveWeight) = 0 ⇒ ~0 contribution', () => {
    const base = baseCredibility(option({ prior: 0.5 }), cfg);
    const withDeadChild = scoreNode(
      option({ prior: 0.5, children: [evidence('strengthen', { prior: 0.9, effectiveWeight: 0 })] }),
      cfg,
    );
    expect(withDeadChild).toBeCloseTo(base, 6);
  });
});

describe('property: one systematic-review ≥ many independent anecdotes', () => {
  it('holds', () => {
    const review = scoreNode(
      option({ prior: 0.5, children: [evidence('strengthen', { prior: 0.9, effectiveWeight: 1 })] }),
      cfg,
    );
    const anecdotes = scoreNode(
      option({
        prior: 0.5,
        children: Array.from({ length: 8 }, (_, i) =>
          evidence('strengthen', { id: `an-${i}`, prior: 0.1, effectiveWeight: 1 }),
        ),
      }),
      cfg,
    );
    expect(review).toBeGreaterThanOrEqual(anecdotes);
  });
});

describe('property: N duplicates (independence→0) ≈ one', () => {
  it('holds', () => {
    const one = scoreNode(
      option({ prior: 0.5, children: [evidence('strengthen', { prior: 0.8, effectiveWeight: 1 })] }),
      cfg,
    );
    // the first reporter is independent (1); the rest are near-duplicates (~0)
    const many = scoreNode(
      option({
        prior: 0.5,
        children: [
          evidence('strengthen', { id: 'd0', prior: 0.8, effectiveWeight: 1 }),
          ...Array.from({ length: 6 }, (_, i) =>
            evidence('strengthen', { id: `d${i + 1}`, prior: 0.8, effectiveWeight: 0.01 }),
          ),
        ],
      }),
      cfg,
    );
    expect(Math.abs(many - one)).toBeLessThan(0.05);
  });
});

describe('property: corroborator never lowers C, falsifier never raises it', () => {
  it('holds', () => {
    const bare = scoreNode(option({ prior: 0.5 }), cfg);
    const withSupport = scoreNode(
      option({ prior: 0.5, children: [evidence('strengthen', { prior: 0.7, effectiveWeight: 1 })] }),
      cfg,
    );
    const withAttack = scoreNode(
      option({ prior: 0.5, children: [evidence('critique', { prior: 0.7, effectiveWeight: 1 })] }),
      cfg,
    );
    expect(withSupport).toBeGreaterThanOrEqual(bare);
    expect(withAttack).toBeLessThanOrEqual(bare);
  });
});

describe('recursive: evidence about evidence', () => {
  it('a critique of a critique partially restores the option', () => {
    const attackedOnce = scoreNode(
      option({ prior: 0.6, children: [evidence('critique', { id: 'c1', prior: 0.8, effectiveWeight: 1 })] }),
      cfg,
    );
    const attackedThenDefended = scoreNode(
      option({
        prior: 0.6,
        children: [
          evidence('critique', {
            id: 'c1',
            prior: 0.8,
            effectiveWeight: 1,
            // a critique OF the critique weakens it
            children: [evidence('critique', { id: 'c2', prior: 0.8, effectiveWeight: 1 })],
          }),
        ],
      }),
      cfg,
    );
    expect(attackedThenDefended).toBeGreaterThan(attackedOnce);
  });
});

describe('clamp01', () => {
  it('clamps and handles NaN', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
  });
});
