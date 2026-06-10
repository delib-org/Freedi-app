import { describe, it, expect } from 'vitest';
import { createTaxonomy, DEFAULT_TAXONOMY } from '../taxonomy';
import {
  getIndependence,
  getConvergence,
  registerScorer,
  getScorer,
  listScorerVersions,
} from '../registry';
import { cosineSimilarity } from '../independence/embeddingCluster';

describe('taxonomy', () => {
  const tax = createTaxonomy();

  it('orders classes by strength (anecdote < review)', () => {
    expect(tax.lookup('anecdote')).toBeLessThan(tax.lookup('systematic-review'));
  });

  it('falls back for unknown classes and pills', () => {
    expect(tax.lookup('nonexistent')).toBeCloseTo(0.2, 6);
    expect(tax.fallbackForPill('strengthen')).toBeCloseTo(0.2, 6);
    expect(tax.has('experiment')).toBe(true);
    expect(tax.has('nope')).toBe(false);
  });

  it('exposes a version', () => {
    expect(tax.version).toBe(DEFAULT_TAXONOMY.version);
  });
});

describe('registry defaults (registered on import of index)', () => {
  it('has a default independence estimator and convergence metric', async () => {
    // importing index.ts registers the defaults
    await import('../index');
    expect(getIndependence().version).toContain('independence-v1');
    expect(getConvergence().version).toContain('convergence-v1');
  });

  it('registers and retrieves a scorer, defaulting to latest', () => {
    registerScorer({
      version: 'scorer-test-1',
      async score() {
        return {
          relation: 'corroborate',
          evidenceClass: 'experiment',
          baseStrength: 0.75,
          confidence: 0.9,
          independenceFactor: 1,
          effectiveWeight: 1,
          rationale: 'test',
          source: 'ai',
        };
      },
    });
    expect(listScorerVersions()).toContain('scorer-test-1');
    expect(getScorer().version).toBe('scorer-test-1');
    expect(getScorer('scorer-test-1').version).toBe('scorer-test-1');
    expect(() => getScorer('missing')).toThrow();
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
});
