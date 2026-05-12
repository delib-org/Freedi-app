/**
 * Discovery function: runs once per day, finds every question that should be
 * backed up today, and writes one Firestore `backupRequests` doc per item.
 * The backupSurveyOnRequest worker (Firestore trigger) fans out from there.
 *
 * Backs up:
 *   - Every active mass-consensus question (statementType=question,
 *     questionSettings.questionType='mass-consensus', not halted, deadline
 *     in the future or unset).
 *   - Every question explicitly opted-in via questionSettings.autoBackup === true.
 *
 * (Sign documents are out of scope for the automatic schedule — admins can
 * still trigger one-shot backups from the main app's "Backup now" affordance.)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { functionConfig, QuestionType, StatementType } from '@freedi/shared-types';
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

		// Discover candidates: anything with statementType=question. We then
		// filter by either (a) MC + active, or (b) autoBackup opt-in, on the
		// client side. Two separate composite-indexed queries would also work
		// but the candidate set is small.
		const snap = await db
			.collection('statements')
			.where('statementType', '==', StatementType.question)
			.get();

		const toBackUp = new Set<string>();
		let mcCount = 0;
		let optInCount = 0;
		snap.forEach((doc) => {
			const data = doc.data() as {
				questionSettings?: {
					questionType?: QuestionType;
					isHalted?: boolean;
					deadline?: number;
					autoBackup?: boolean;
				};
			};
			const qs = data.questionSettings ?? {};
			const isMc = qs.questionType === QuestionType.massConsensus;
			const halted = qs.isHalted === true;
			const expired = typeof qs.deadline === 'number' && qs.deadline > 0 && qs.deadline < now;
			const activeMc = isMc && !halted && !expired;

			if (activeMc) {
				toBackUp.add(doc.id);
				mcCount++;
			}
			if (qs.autoBackup === true) {
				if (!toBackUp.has(doc.id)) optInCount++;
				toBackUp.add(doc.id);
			}
		});

		logger.info('scheduledDailyBackups: discovered', {
			projectId,
			total: toBackUp.size,
			mcCount,
			optInCount,
		});

		const requests = db.collection('backupRequests');
		let enqueued = 0;

		for (const id of toBackUp) {
			try {
				const reqDoc: BackupRequestDoc = {
					questionId: id,
					sourceProjectId: projectId,
					kind: 'mc',
					createdAt: now,
				};
				await requests.add(reqDoc);
				enqueued++;
			} catch (error) {
				logger.error('scheduledDailyBackups: enqueue failed', {
					questionId: id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		logger.info('scheduledDailyBackups: enqueued', { enqueued });
	},
);
