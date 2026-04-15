/**
 * Daily retention job: prune non-research statement history older than
 * 90 days. Research entries (isResearch = 1) are kept indefinitely.
 *
 * Uses a collectionGroup query across the `statementHistory` subcollection
 * so we don't need to enumerate parent statements.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import { Collections, functionConfig } from '@freedi/shared-types';
import { db } from '../../index';

const RETENTION_DAYS = 90;
const BATCH_SIZE = 500;

export const cleanupStatementHistory = onSchedule(
	{
		schedule: '15 3 * * *', // 03:15 UTC daily — offset from researchLogs cleanup (03:00)
		timeZone: 'UTC',
		retryCount: 1,
		memory: '256MiB',
		region: functionConfig.region,
	},
	async () => {
		const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
		let totalDeleted = 0;

		while (true) {
			const snapshot = await db
				.collectionGroup(Collections.statementHistory)
				.where('isResearch', '==', 0)
				.where('createdAt', '<', cutoffMs)
				.limit(BATCH_SIZE)
				.get();

			if (snapshot.empty) break;

			const batch = db.batch();
			snapshot.docs.forEach((doc) => batch.delete(doc.ref));
			await batch.commit();

			totalDeleted += snapshot.size;
			if (snapshot.size < BATCH_SIZE) break;
		}

		logger.info(
			`[statementHistory] Deleted ${totalDeleted} non-research entries older than ${RETENTION_DAYS} days`,
		);
	},
);
