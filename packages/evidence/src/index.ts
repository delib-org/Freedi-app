/**
 * `@freedi/evidence` — pure, framework-agnostic dialectical evidence engine.
 * Imported by both `functions/` and the `apps/chat` client. No Firebase, no AI
 * SDK. Side effect on import: registers the default independence estimator and
 * convergence metric so `getIndependence()` / `getConvergence()` work without
 * the consumer wiring them up. The AI `EvidenceScorer` is registered by the
 * functions process at runtime.
 */
export * from './types';
export * from './registry';
export * from './containment';
export * from './corroboration';
export * from './convergence';
export * from './aggregates';
export * from './taxonomy';
export { embeddingClusterIndependence, cosineSimilarity } from './independence/embeddingCluster';

import { registerIndependence, registerConvergence } from './registry';
import { embeddingClusterIndependence } from './independence/embeddingCluster';
import { convergenceV1 } from './convergence';

registerIndependence(embeddingClusterIndependence);
registerConvergence(convergenceV1);
