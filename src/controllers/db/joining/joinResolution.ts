import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FireStore, functions } from '@/controllers/db/config';
import {
	Collections,
	JoinResolutionUser,
	JOIN_RESOLUTION_USERS_SUBCOLLECTION,
} from '@freedi/shared-types';
import { logError, DatabaseError } from '@/utils/errorHandling';
import { updateTimestamp } from '@/utils/firebaseUtils';

export interface ResolveSummary {
	activatedCount: number;
	failedCount: number;
	confirmedCount: number;
	orphanedCount: number;
	pruningCount: number;
}

/**
 * Admin-only: calls the `resolveJoinIntents` Cloud Function. This is a
 * one-way operation — the server rejects the call if the question has
 * already been resolved.
 */
export async function resolveJoinIntents(questionId: string): Promise<ResolveSummary | undefined> {
	try {
		const callable = httpsCallable<{ questionId: string }, ResolveSummary>(
			functions,
			'resolveJoinIntents',
		);
		const result = await callable({ questionId });

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'joinResolution.resolveJoinIntents',
			statementId: questionId,
		});

		return undefined;
	}
}

function resolutionUserRef(questionId: string, userId: string) {
	return doc(
		FireStore,
		Collections.statements,
		questionId,
		JOIN_RESOLUTION_USERS_SUBCOLLECTION,
		userId,
	);
}

/**
 * Fetches the current user's post-resolve state on a given question.
 * Returns `undefined` if the question hasn't been resolved or the user
 * had no intents.
 */
export async function getMyResolutionState(
	questionId: string,
	userId: string,
): Promise<JoinResolutionUser | undefined> {
	if (!questionId || !userId) return undefined;
	try {
		const snap = await getDoc(resolutionUserRef(questionId, userId));
		if (!snap.exists()) return undefined;

		return snap.data() as JoinResolutionUser;
	} catch (error) {
		logError(error, {
			operation: 'joinResolution.getMyResolutionState',
			userId,
			statementId: questionId,
		});

		return undefined;
	}
}

/**
 * Marks the user's `needsPruning` state as acknowledged. The actual option
 * removal still goes through `toggleJoining()` with `role: 'activist'` on
 * each option to be dropped — this function only flips the subcollection
 * flag and stores the final list of committed options.
 */
export async function markPruningComplete(
	questionId: string,
	userId: string,
	keepOptionIds: string[],
): Promise<void> {
	try {
		const ref = resolutionUserRef(questionId, userId);
		const { lastUpdate } = updateTimestamp();
		await setDoc(
			ref,
			{
				status: 'confirmed',
				activatedIntents: keepOptionIds,
				lastUpdate,
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'joinResolution.markPruningComplete',
			userId,
			statementId: questionId,
		});
		throw new DatabaseError('Failed to mark pruning complete', {
			userId,
			statementId: questionId,
		});
	}
}
