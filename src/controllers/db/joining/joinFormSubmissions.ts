import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import {
	Collections,
	JoinFormSubmission,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
} from '@freedi/shared-types';
import { createTimestamps, updateTimestamp } from '@/utils/firebaseUtils';
import { logError, DatabaseError, ValidationError } from '@/utils/errorHandling';

/**
 * In-session cache of "has submission" per (questionId, userId). Populated on
 * first fetch so repeated join clicks under the same question don't re-read
 * Firestore. The cache is cleared explicitly on auth changes via
 * `clearJoinFormSubmissionCache()`.
 */
const submissionCache = new Map<string, boolean>();

function cacheKey(questionId: string, userId: string): string {
	return `${questionId}--${userId}`;
}

function submissionDocRef(questionId: string, userId: string) {
	return doc(
		FireStore,
		Collections.statements,
		questionId,
		JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
		userId,
	);
}

export function clearJoinFormSubmissionCache(): void {
	submissionCache.clear();
}

/**
 * Returns `true` if the user has already submitted the join form for this
 * question. Reads the cache first, then Firestore on a miss. Never throws —
 * errors are logged and treated as "no submission" (which will re-prompt the
 * modal; a duplicate submission is better than a stuck user).
 */
export async function hasJoinFormSubmission(questionId: string, userId: string): Promise<boolean> {
	if (!questionId || !userId) return false;
	const key = cacheKey(questionId, userId);

	const cached = submissionCache.get(key);
	if (cached !== undefined) return cached;

	try {
		const snap = await getDoc(submissionDocRef(questionId, userId));
		const exists = snap.exists();
		submissionCache.set(key, exists);

		return exists;
	} catch (error) {
		logError(error, {
			operation: 'joinFormSubmissions.hasJoinFormSubmission',
			userId,
			statementId: questionId,
		});

		return false;
	}
}

/**
 * Fetches the full submission document. Used by the admin panel and for
 * prefilling the modal if we ever want to let users edit their submission.
 */
export async function getJoinFormSubmission(
	questionId: string,
	userId: string,
): Promise<JoinFormSubmission | undefined> {
	if (!questionId || !userId) return undefined;

	try {
		const snap = await getDoc(submissionDocRef(questionId, userId));
		if (!snap.exists()) return undefined;

		return snap.data() as JoinFormSubmission;
	} catch (error) {
		logError(error, {
			operation: 'joinFormSubmissions.getJoinFormSubmission',
			userId,
			statementId: questionId,
		});

		return undefined;
	}
}

interface SaveParams {
	questionId: string;
	userId: string;
	displayName: string;
	values: Record<string, string>;
}

/**
 * Create-or-update a user's join form submission for a question. Uses
 * `setDoc` with merge so the first save creates the document (and the
 * Sheets-export trigger fires once via `onDocumentCreated`), while later
 * edits update the existing row without re-triggering the export.
 */
export async function saveJoinFormSubmission(params: SaveParams): Promise<void> {
	const { questionId, userId, displayName, values } = params;

	if (!questionId || !userId) {
		throw new ValidationError('questionId and userId are required', {
			operation: 'joinFormSubmissions.saveJoinFormSubmission',
			metadata: { questionId, userId },
		});
	}

	try {
		const ref = submissionDocRef(questionId, userId);
		const existing = await getDoc(ref);

		if (existing.exists()) {
			const { lastUpdate } = updateTimestamp();
			await setDoc(
				ref,
				{
					values,
					displayName,
					lastUpdate,
				},
				{ merge: true },
			);
		} else {
			const { createdAt, lastUpdate } = createTimestamps();
			const submission: JoinFormSubmission = {
				userId,
				questionId,
				displayName,
				values,
				createdAt,
				lastUpdate,
			};
			await setDoc(ref, submission);
		}

		submissionCache.set(cacheKey(questionId, userId), true);
	} catch (error) {
		logError(error, {
			operation: 'joinFormSubmissions.saveJoinFormSubmission',
			userId,
			statementId: questionId,
		});
		throw new DatabaseError('Failed to save join form submission', {
			operation: 'joinFormSubmissions.saveJoinFormSubmission',
			userId,
			statementId: questionId,
		});
	}
}
