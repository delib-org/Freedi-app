/**
 * Late-registration registries for the swappable mechanisms. The pure package
 * ships the default `IndependenceEstimator` + `ConvergenceMetric`; the AI
 * `EvidenceScorer` is registered at runtime by the Cloud Functions process
 * (it carries the Gemini SDK, which must never enter this package).
 *
 * `getX(version?)` defaults to the *most recently registered* implementation.
 */
import type {
  EvidenceScorer,
  IndependenceEstimator,
  ConvergenceMetric,
} from './types';

function makeRegistry<T extends { version: string }>(kind: string) {
  const byVersion = new Map<string, T>();
  let latest: string | undefined;

  return {
    register(impl: T): void {
      byVersion.set(impl.version, impl);
      latest = impl.version;
    },
    get(version?: string): T {
      if (version) {
        const impl = byVersion.get(version);
        if (!impl) {
          throw new Error(`No ${kind} registered for version "${version}"`);
        }

        return impl;
      }
      if (!latest) {
        throw new Error(`No ${kind} registered`);
      }

      return byVersion.get(latest) as T;
    },
    has(version: string): boolean {
      return byVersion.has(version);
    },
    versions(): string[] {
      return [...byVersion.keys()].sort();
    },
  };
}

const scorerRegistry = makeRegistry<EvidenceScorer>('scorer');
const independenceRegistry = makeRegistry<IndependenceEstimator>('independence estimator');
const convergenceRegistry = makeRegistry<ConvergenceMetric>('convergence metric');

export const registerScorer = (s: EvidenceScorer): void => scorerRegistry.register(s);
export const getScorer = (version?: string): EvidenceScorer => scorerRegistry.get(version);
export const hasScorer = (version: string): boolean => scorerRegistry.has(version);
export const listScorerVersions = (): string[] => scorerRegistry.versions();

export const registerIndependence = (e: IndependenceEstimator): void =>
  independenceRegistry.register(e);
export const getIndependence = (version?: string): IndependenceEstimator =>
  independenceRegistry.get(version);
export const listIndependenceVersions = (): string[] => independenceRegistry.versions();

export const registerConvergence = (m: ConvergenceMetric): void =>
  convergenceRegistry.register(m);
export const getConvergence = (version?: string): ConvergenceMetric =>
  convergenceRegistry.get(version);
export const listConvergenceVersions = (): string[] => convergenceRegistry.versions();
