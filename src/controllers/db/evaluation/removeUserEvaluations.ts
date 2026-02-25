import { getDocs, query, where, writeBatch } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Evaluation } from '@freedi/shared-types';
import { createCollectionRef, createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

/**
 * Removes all evaluations and votes by a specific user for a statement and its options
 * This is typically called when banning a user and choosing to remove their votes
 * @param statementId - The parent statement ID
 * @param userId - The user ID whose evaluations should be removed
 * @returns Promise<{ evaluationsRemoved: number, votesRemoved: number }>
 */
export async function removeUserEvaluations(
	statementId: string,
	userId: string,
): Promise<{ evaluationsRemoved: number; votesRemoved: number }> {
	try {
		if (!statementId || !userId) {
			throw new Error('Statement ID and User ID are required');
		}

		let evaluationsRemoved = 0;
		let votesRemoved = 0;

		// 1. Remove evaluations for all child options of this statement
		// Query evaluations where the user evaluated options under this parent
		const evaluationsRef = createCollectionRef(Collections.evaluations);
		const evaluationsQuery = query(
			evaluationsRef,
			where('parentId', '==', statementId),
			where('evaluatorId', '==', userId),
		);

		const evaluationsSnapshot = await getDocs(evaluationsQuery);

		// Use batch to delete all evaluations efficiently
		const batch = writeBatch(FireStore);

		evaluationsSnapshot.forEach((docSnapshot) => {
			const evaluation = docSnapshot.data() as Evaluation;
			console.info('Removing evaluation:', {
				evaluationId: docSnapshot.id,
				statementId: evaluation.statementId,
				value: evaluation.evaluation,
				userId,
			});

			// Delete the evaluation document
			// This will trigger the Firebase function deleteEvaluation
			// which will automatically update the statement counters
			batch.delete(docSnapshot.ref);
			evaluationsRemoved++;
		});

		// 2. Remove votes (for voting systems)
		// The vote ID is constructed as {userId}--{parentId}
		const voteId = `${userId}--${statementId}`;
		const voteRef = createDocRef(Collections.votes, voteId);

		// Check if vote exists and delete it
		// Note: We can't check existence in a batch, so we'll try to delete
		// If it doesn't exist, it will just be a no-op
		batch.delete(voteRef);
		votesRemoved = 1; // Assume one vote per user per statement

		// Commit all deletions in a single batch operation
		await batch.commit();

		console.info('Successfully removed user evaluations:', {
			statementId,
			userId,
			evaluationsRemoved,
			votesRemoved,
		});

		return { evaluationsRemoved, votesRemoved };
	} catch (error) {
		logError(error, {
			operation: 'evaluation.removeUserEvaluations.deleteEvaluation',
			metadata: { message: 'Error removing user evaluations:' },
		});
		throw error;
	}
}

/**
 * Removes all evaluations by a user across all statements
 * This would be used for a global ban or account deletion
 * @param userId - The user ID whose evaluations should be removed globally
 * @returns Promise<number> - Number of evaluations removed
 */
export async function removeAllUserEvaluations(userId: string): Promise<number> {
	try {
		if (!userId) {
			throw new Error('User ID is required');
		}

		let evaluationsRemoved = 0;

		// Query all evaluations by this user
		const evaluationsRef = createCollectionRef(Collections.evaluations);
		const evaluationsQuery = query(evaluationsRef, where('evaluatorId', '==', userId));

		const evaluationsSnapshot = await getDocs(evaluationsQuery);

		// Use batch to delete all evaluations efficiently
		const batch = writeBatch(FireStore);

		evaluationsSnapshot.forEach((docSnapshot) => {
			batch.delete(docSnapshot.ref);
			evaluationsRemoved++;
		});

		// Also remove all votes by this user
		const votesRef = createCollectionRef(Collections.votes);
		const votesQuery = query(votesRef, where('userId', '==', userId));

		const votesSnapshot = await getDocs(votesQuery);

		votesSnapshot.forEach((docSnapshot) => {
			batch.delete(docSnapshot.ref);
		});

		// Commit all deletions
		await batch.commit();

		console.info('Successfully removed all user evaluations:', {
			userId,
			evaluationsRemoved,
			votesRemoved: votesSnapshot.size,
		});

		return evaluationsRemoved;
	} catch (error) {
		logError(error, {
			operation: 'evaluation.removeUserEvaluations.unknown',
			metadata: { message: 'Error removing all user evaluations:' },
		});
		throw error;
	}
}
