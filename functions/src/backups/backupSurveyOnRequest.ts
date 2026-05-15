/**
 * Worker function: backs up a single question's data. Triggered by a new
 * document in `backupRequests`. The scheduler and the manual callable both
 * write request docs that fan into this worker so timeouts are bounded to
 * a single survey per invocation.
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
	/**
	 * MC admin context: when the cron discovered this question through an
	 * active row in the `surveys` collection, this is that surveyId. The
	 * worker uses it to (a) group the output object by survey and (b) embed
	 * the survey doc + its surveyProgress in the backup so the bundle is
	 * self-contained.
	 */
	mcSurveyId?: string;
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
		const { questionId, sourceProjectId, kind, mcSurveyId } = data;

		if (!questionId || !sourceProjectId || !kind) {
			logger.error('backupSurveyOnRequest: malformed request doc', {
				requestId: event.params.requestId,
				data,
			});
			await requestRef.update({
				status: 'error',
				error: 'malformed request',
				finishedAt: Date.now(),
			});

			return;
		}

		const db = getFirestore();
		const storage = new Storage({ projectId: sourceProjectId });
		const bucket = `${sourceProjectId}-survey-backups`;
		const today = new Date().toISOString().slice(0, 10);

		// Object key layout:
		//   manual/<questionId>/<ts>.json                       — manual button
		//   scheduled/<surveyId>/<questionId>-<date>.json       — MC admin survey
		//   scheduled/<questionId>/<date>.json                  — opt-in question
		let objectPath: string;
		if (kind === 'manual') {
			objectPath = `manual/${questionId}/${Date.now()}.json`;
		} else if (mcSurveyId) {
			objectPath = `scheduled/${mcSurveyId}/${questionId}-${today}.json`;
		} else {
			objectPath = `scheduled/${questionId}/${today}.json`;
		}

		const started = Date.now();
		logger.info('backupSurveyOnRequest: starting', {
			questionId,
			kind,
			mcSurveyId: mcSurveyId ?? null,
			sourceProjectId,
			requestId: event.params.requestId,
		});

		try {
			const result = await exportSurveyToGcs(db, storage, {
				questionId,
				sourceProjectId,
				mcSurveyId,
				destination: `gs://${bucket}/${objectPath}`,
			});

			logger.info('backupSurveyOnRequest: done', {
				questionId,
				kind,
				mcSurveyId: mcSurveyId ?? null,
				destination: result.destination,
				bytes: result.bytes,
				descendantCount: result.descendantCount,
				durationMs: Date.now() - started,
				counts: result.counts,
			});

			await requestRef.delete();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('backupSurveyOnRequest: failed', {
				questionId,
				kind,
				mcSurveyId,
				error: message,
			});
			await requestRef.update({ status: 'error', error: message, finishedAt: Date.now() });
		}
	},
);
