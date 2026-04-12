import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import { db } from './index';
import { Collections, functionConfig } from '@freedi/shared-types';

const RETENTION_DAYS = 365;
const BATCH_SIZE = 500;

/**
 * Scheduled function to delete research logs older than the retention period.
 * Runs daily at 3:00 AM UTC.
 */
export const cleanupResearchLogs = onSchedule(
	{
		schedule: '0 3 * * *',
		timeZone: 'UTC',
		...functionConfig,
		region: 'us-central1',
	},
	async () => {
		const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
		let totalDeleted = 0;
		let hasMore = true;

		while (hasMore) {
			const snapshot = await db
				.collection(Collections.researchLogs)
				.where('timestamp', '<', cutoffMs)
				.limit(BATCH_SIZE)
				.get();

			if (snapshot.empty) {
				hasMore = false;
				break;
			}

			const batch = db.batch();
			snapshot.docs.forEach((doc) => batch.delete(doc.ref));
			await batch.commit();

			totalDeleted += snapshot.size;

			if (snapshot.size < BATCH_SIZE) {
				hasMore = false;
			}
		}

		logger.info(
			`[ResearchRetention] Deleted ${totalDeleted} logs older than ${RETENTION_DAYS} days`,
		);
	},
);
