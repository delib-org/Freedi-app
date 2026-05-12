/**
 * Worker function: backs up a single survey/question. Triggered by a new
 * document in `backupRequests`. The scheduled-discovery function and the
 * manual-trigger callable both write request docs that fan into this worker
 * so timeouts are bounded to a single survey per invocation.
 *
 * After a successful backup the request doc is deleted; on failure the doc
 * is updated with the error and left for inspection (Firestore triggers
 * don't retry automatically — that's OK for backups since the next daily
 * cron will retry the survey anyway).
 *
 * We use a Firestore trigger instead of Cloud Tasks because Cloud Tasks
 * is not available in me-west1 yet; Firestore + Functions both run in
 * me-west1 natively.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { functionConfig } from '@freedi/shared-types';
import { exportSurveyToGcs } from './exportSurvey';

export interface BackupRequestDoc {
	questionId: string;
	sourceProjectId: string;
	kind: 'mc' | 'sign' | 'manual';
	createdAt: number;
	createdBy?: string;
}

export const backupSurveyOnRequest = onDocumentCreated(
	{
		document: 'backupRequests/{requestId}',
		region: functionConfig.region,
		timeoutSeconds: 540,
		memory: '1GiB',
		retry: false,
	},
	async (event): Promise<void> => {
		const snap = event.data;
		if (!snap) return;
		const requestRef = snap.ref;
		const data = snap.data() as Partial<BackupRequestDoc>;
		const { questionId, sourceProjectId, kind } = data;

		if (!questionId || !sourceProjectId || !kind) {
			logger.error('backupSurveyOnRequest: malformed request doc', {
				requestId: event.params.requestId,
				data,
			});
			await requestRef.update({ status: 'error', error: 'malformed request', finishedAt: Date.now() });
			return;
		}

		const db = getFirestore();
		const storage = new Storage({ projectId: sourceProjectId });
		const bucket = `${sourceProjectId}-survey-backups`;
		const today = new Date().toISOString().slice(0, 10);
		const objectPath =
			kind === 'manual'
				? `manual/${questionId}/${Date.now()}.json`
				: `scheduled/${questionId}/${today}.json`;

		const started = Date.now();
		logger.info('backupSurveyOnRequest: starting', {
			questionId,
			kind,
			sourceProjectId,
			requestId: event.params.requestId,
		});

		try {
			const result = await exportSurveyToGcs(db, storage, {
				questionId,
				sourceProjectId,
				destination: `gs://${bucket}/${objectPath}`,
			});

			logger.info('backupSurveyOnRequest: done', {
				questionId,
				kind,
				destination: result.destination,
				bytes: result.bytes,
				descendantCount: result.descendantCount,
				durationMs: Date.now() - started,
				counts: result.counts,
			});

			// Successful → remove the request doc so the collection doesn't grow.
			await requestRef.delete();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('backupSurveyOnRequest: failed', { questionId, kind, error: message });
			await requestRef.update({ status: 'error', error: message, finishedAt: Date.now() });
		}
	},
);
