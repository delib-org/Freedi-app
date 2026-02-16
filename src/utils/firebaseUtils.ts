/**
 * Firebase Utilities
 *
 * Common Firebase operations and patterns to reduce code duplication.
 */

import {
	doc,
	collection,
	writeBatch,
	DocumentReference,
	CollectionReference,
} from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { Collections } from '@freedi/shared-types';

/**
 * Create a document reference
 */
export function createDocRef(collectionName: Collections, docId: string): DocumentReference {
	return doc(FireStore, collectionName, docId);
}

/**
 * Create a collection reference
 */
export function createCollectionRef(collectionName: Collections): CollectionReference {
	return collection(FireStore, collectionName);
}

/**
 * Create a statement document reference
 */
export function createStatementRef(statementId: string): DocumentReference {
	return createDocRef(Collections.statements, statementId);
}

/**
 * Create an evaluation document reference
 */
export function createEvaluationRef(evaluationId: string): DocumentReference {
	return createDocRef(Collections.evaluations, evaluationId);
}

/**
 * Create a subscription document reference
 */
export function createSubscriptionRef(subscriptionId: string): DocumentReference {
	return createDocRef(Collections.statementsSubscribe, subscriptionId);
}

/**
 * Batch update helper
 */
export interface BatchUpdate {
	ref: DocumentReference;
	data: Record<string, unknown>;
}

export async function executeBatchUpdates(updates: BatchUpdate[]): Promise<void> {
	const BATCH_SIZE = 500; // Firestore limit
	const batches = [];

	for (let i = 0; i < updates.length; i += BATCH_SIZE) {
		const batchUpdates = updates.slice(i, i + BATCH_SIZE);
		const batch = writeBatch(FireStore);

		batchUpdates.forEach(({ ref, data }) => {
			batch.update(ref, data);
		});

		batches.push(batch.commit());
	}

	await Promise.all(batches);
}

/**
 * Timestamp utilities
 */
export function getCurrentTimestamp(): number {
	return Date.now();
}

/**
 * Create timestamps for new documents
 */
export function createTimestamps(): {
	createdAt: number;
	lastUpdate: number;
} {
	const now = getCurrentTimestamp();

	return {
		createdAt: now,
		lastUpdate: now,
	};
}

/**
 * Update timestamp
 */
export function updateTimestamp(): { lastUpdate: number } {
	return {
		lastUpdate: getCurrentTimestamp(),
	};
}
