/**
 * Evidence taxonomy (§1d) — committed, versioned config mapping an
 * `evidenceClass` to a Bayesian `baseStrength`. A Firestore override may live
 * at `config/evidenceTaxonomy/{version}`; defaults below are a revisable
 * convention re-fit to human labels by the calibration harness (Phase 7).
 *
 * The canonical data is mirrored as `taxonomy.default.json` for Firestore
 * seeding; this TS const is the runtime source of truth (kept in sync).
 */
import type { EvidenceTaxonomy } from './types';

export const DEFAULT_TAXONOMY: EvidenceTaxonomy = {
  version: 'tax-2026-06-07',
  classes: {
    anecdote: { baseStrength: 0.1, label: 'Personal testimony / anecdote' },
    'case-series': { baseStrength: 0.25, label: 'Multiple informal reports' },
    'expert-opinion': { baseStrength: 0.4, label: 'Expert opinion' },
    observational: { baseStrength: 0.55, label: 'Observational study / survey' },
    experiment: { baseStrength: 0.75, label: 'Controlled experiment / RCT' },
    'systematic-review': { baseStrength: 0.9, label: 'Systematic review / meta-analysis' },
    'formal-argument': {
      baseStrength: 0.95,
      label: 'Formal / deductive argument (domain-dependent)',
    },
  },
  fallbackByPill: { strengthen: 0.2, critique: 0.2 },
};

export interface ResolvedTaxonomy {
  readonly version: string;
  /** baseStrength for an evidence class; falls back to the neutral default. */
  lookup(evidenceClass: string): number;
  /** baseStrength to use when the scorer can't classify, keyed by the user's pill. */
  fallbackForPill(pill: string): number;
  /** Display label for an evidence class. */
  label(evidenceClass: string): string;
  /** Whether the class exists in this taxonomy. */
  has(evidenceClass: string): boolean;
  readonly raw: EvidenceTaxonomy;
}

const NEUTRAL_FALLBACK = 0.2;

export function createTaxonomy(taxonomy: EvidenceTaxonomy = DEFAULT_TAXONOMY): ResolvedTaxonomy {
  return {
    version: taxonomy.version,
    lookup(evidenceClass: string): number {
      return taxonomy.classes[evidenceClass]?.baseStrength ?? NEUTRAL_FALLBACK;
    },
    fallbackForPill(pill: string): number {
      return taxonomy.fallbackByPill[pill] ?? NEUTRAL_FALLBACK;
    },
    label(evidenceClass: string): string {
      return taxonomy.classes[evidenceClass]?.label ?? evidenceClass;
    },
    has(evidenceClass: string): boolean {
      return evidenceClass in taxonomy.classes;
    },
    raw: taxonomy,
  };
}
