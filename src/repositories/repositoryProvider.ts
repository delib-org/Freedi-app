/**
 * Repository Provider
 *
 * Simple service locator that provides singleton instances of repository
 * implementations. Currently uses Firebase implementations. To switch to
 * a different data source, replace the implementation classes here.
 */

import type { IStatementRepository } from './interfaces/IStatementRepository';
import type { IEvaluationRepository } from './interfaces/IEvaluationRepository';
import type { ISubscriptionRepository } from './interfaces/ISubscriptionRepository';
import type { IVoteRepository } from './interfaces/IVoteRepository';
import { FirebaseStatementRepository } from './firebase/FirebaseStatementRepository';
import { FirebaseEvaluationRepository } from './firebase/FirebaseEvaluationRepository';
import { FirebaseSubscriptionRepository } from './firebase/FirebaseSubscriptionRepository';
import { FirebaseVoteRepository } from './firebase/FirebaseVoteRepository';

const repositories = {
	statements: new FirebaseStatementRepository(),
	evaluations: new FirebaseEvaluationRepository(),
	subscriptions: new FirebaseSubscriptionRepository(),
	votes: new FirebaseVoteRepository(),
};

export function getStatementRepository(): IStatementRepository {
	return repositories.statements;
}

export function getEvaluationRepository(): IEvaluationRepository {
	return repositories.evaluations;
}

export function getSubscriptionRepository(): ISubscriptionRepository {
	return repositories.subscriptions;
}

export function getVoteRepository(): IVoteRepository {
	return repositories.votes;
}
