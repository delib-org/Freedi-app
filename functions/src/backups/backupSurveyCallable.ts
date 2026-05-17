/**
 * HTTPS-callable function used by the main-app admin UI's "Backup now" button.
 * Authenticates the caller as admin/creator on the question, then writes a
 * single Firestore request doc that the backupSurveyOnRequest worker
 * (Firestore trigger) picks up and runs.
 *
 * The actual upload happens in the worker, not here — that keeps this call
 * fast and predictable for the UI. The returned destination is what the
 * worker WILL write; it lands in the bucket within a minute or two.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Role, functionConfig } from '@freedi/shared-types';
import type { BackupRequestDoc } from './backupSurveyOnRequest';

interface RequestData {
	questionId: string;
}

interface ResponseData {
	ok: true;
	destination: string;
	message: string;
}

export const backupSurveyCallable = onCall<RequestData, Promise<ResponseData>>(
	{ region: functionConfig.region, memory: '256MiB', timeoutSeconds: 60 },
	async (req: CallableRequest<RequestData>) => {
		if (!req.auth?.uid) {
			throw new HttpsError('unauthenticated', 'Sign in to request a backup.');
		}
		const userId = req.auth.uid;
		const questionId = req.data?.questionId;
		if (!questionId || typeof questionId !== 'string') {
			throw new HttpsError('invalid-argument', 'questionId is required.');
		}

		const db = getFirestore();

		const questionDoc = await db.collection('statements').doc(questionId).get();
		if (!questionDoc.exists) {
			throw new HttpsError('not-found', `Question ${questionId} not found.`);
		}

		const subDoc = await db.collection('statementsSubscribe').doc(`${userId}--${questionId}`).get();
		const role = subDoc.exists ? (subDoc.data()?.role as string | undefined) : undefined;
		const isAdmin = role === Role.admin || role === Role.creator;
		if (!isAdmin) {
			throw new HttpsError(
				'permission-denied',
				'Only admins on this question can trigger a backup.',
			);
		}

		const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'wizcol-app';
		const bucket = `${projectId}-survey-backups`;
		const timestamp = Date.now();
		const destination = `gs://${bucket}/manual/${questionId}/${timestamp}.json`;

		const doc: BackupRequestDoc = {
			questionId,
			sourceProjectId: projectId,
			kind: 'manual',
			createdAt: timestamp,
			createdBy: userId,
		};

		try {
			await db.collection('backupRequests').add(doc);
		} catch (error) {
			logger.error('backupSurveyCallable: enqueue failed', {
				userId,
				questionId,
				error: error instanceof Error ? error.message : String(error),
			});
			throw new HttpsError('internal', 'Could not enqueue backup task.');
		}

		logger.info('backupSurveyCallable: enqueued', { userId, questionId, destination });

		return {
			ok: true,
			destination,
			message: 'Backup enqueued. It will land in the bucket within a minute or two.',
		};
	},
);
