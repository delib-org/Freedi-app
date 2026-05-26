/**
 * Discovery function: runs once per day, finds every survey/question that
 * should be backed up today, and writes one Firestore `backupRequests` doc
 * per item. The backupSurveyOnRequest worker (Firestore trigger) fans out
 * from there.
 *
 * Backs up:
 *   - Every active MC survey (Firestore `surveys` collection where
 *     status === 'active'). For each one, the cron enqueues one backup task
 *     per entry in survey.questionIds[]. The mcSurveyId is carried through
 *     so the worker can embed the survey doc + surveyProgress, and the GCS
 *     path is grouped under the surveyId for readability.
 *   - Every question explicitly opted-in via
 *     questionSettings.autoBackup === true (covers non-MC questions that
 *     admins want included).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { functionConfig, StatementType, SurveyStatus } from '@freedi/shared-types';
import type { BackupRequestDoc } from './backupSurveyOnRequest';

export const scheduledDailyBackups = onSchedule(
	{
		schedule: '0 3 * * *',
		timeZone: 'Asia/Jerusalem',
		region: functionConfig.region,
		memory: '512MiB',
		timeoutSeconds: 300,
	},
	async (): Promise<void> => {
		const db = getFirestore();
		const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'wizcol-app';
		const now = Date.now();

		// 1. Active MC surveys — each one expands to one backup task per
		//    linked questionId.
		const surveysSnap = await db
			.collection('surveys')
			.where('status', '==', SurveyStatus.active)
			.get();

		interface PendingItem {
			questionId: string;
			mcSurveyId?: string;
		}
		const items: PendingItem[] = [];
		const seen = new Set<string>(); // dedupe by `${surveyId}|${questionId}` (or `|${questionId}` for opt-ins)

		surveysSnap.forEach((surveyDoc) => {
			const data = surveyDoc.data() as { questionIds?: string[] };
			const surveyId = surveyDoc.id;
			const qids = Array.isArray(data.questionIds) ? data.questionIds : [];
			for (const qid of qids) {
				if (!qid || typeof qid !== 'string') continue;
				const key = `${surveyId}|${qid}`;
				if (seen.has(key)) continue;
				seen.add(key);
				items.push({ questionId: qid, mcSurveyId: surveyId });
			}
		});

		// 2. Opt-in questions (questionSettings.autoBackup === true) — not part
		//    of any MC admin survey, but the admin asked for daily backups.
		const optSnap = await db
			.collection('statements')
			.where('statementType', '==', StatementType.question)
			.where('questionSettings.autoBackup', '==', true)
			.get();

		optSnap.forEach((doc) => {
			const key = `|${doc.id}`;
			if (seen.has(key)) return;
			seen.add(key);
			items.push({ questionId: doc.id });
		});

		logger.info('scheduledDailyBackups: discovered', {
			projectId,
			activeSurveys: surveysSnap.size,
			optInQuestions: optSnap.size,
			totalTasks: items.length,
		});

		const requests = db.collection('backupRequests');
		let enqueued = 0;

		for (const item of items) {
			try {
				const reqDoc: BackupRequestDoc = {
					questionId: item.questionId,
					sourceProjectId: projectId,
					kind: 'mc',
					createdAt: now,
					...(item.mcSurveyId ? { mcSurveyId: item.mcSurveyId } : {}),
				};
				await requests.add(reqDoc);
				enqueued++;
			} catch (error) {
				logger.error('scheduledDailyBackups: enqueue failed', {
					questionId: item.questionId,
					mcSurveyId: item.mcSurveyId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		logger.info('scheduledDailyBackups: enqueued', { enqueued });
	},
);
