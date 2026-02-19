/**
 * Repositories - Barrel Exports
 *
 * Provides repository interfaces, Firebase implementations, and the
 * repository provider for accessing singleton instances.
 */

// Interfaces
export type { IStatementRepository } from './interfaces/IStatementRepository';
export type { IEvaluationRepository } from './interfaces/IEvaluationRepository';
export type { ISubscriptionRepository } from './interfaces/ISubscriptionRepository';
export type { IVoteRepository } from './interfaces/IVoteRepository';

// Firebase implementations
export { FirebaseStatementRepository } from './firebase/FirebaseStatementRepository';
export { FirebaseEvaluationRepository } from './firebase/FirebaseEvaluationRepository';
export { FirebaseSubscriptionRepository } from './firebase/FirebaseSubscriptionRepository';
export { FirebaseVoteRepository } from './firebase/FirebaseVoteRepository';

// Provider (service locator)
export {
	getStatementRepository,
	getEvaluationRepository,
	getSubscriptionRepository,
	getVoteRepository,
} from './repositoryProvider';
