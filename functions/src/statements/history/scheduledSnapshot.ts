/**
 * Hourly scheduled snapshot of active statements.
 *
 * Runs every hour; writes one history entry per statement whose
 * `lastUpdate` falls within the last hour (+ a small overlap window to
 * avoid missing edge cases). Keeps cost bounded: only active statements
 * get sampled, and each gets at most one snapshot per run.
 *
 * Research-enabled statements still get scheduled snapshots — the
 * per-evaluation `evaluation-change` entries are written separately by
 * the evaluation triggers, so the two streams complement each other.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	Statement,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../index';
import { writeHistoryEntry } from './writeHistoryEntry';
import { isResearchEnabledForTopParent } from './isResearchEnabled';

const WINDOW_MS = 65 * 60 * 1000; // 65 minutes — slight overlap with hourly cadence
const PAGE_SIZE = 500;

export const scheduledStatementHistorySnapshot = onSchedule(
	{
		schedule: '0 * * * *', // top of every hour
		timeZone: 'UTC',
		retryCount: 1,
		memory: '256MiB',
		region: functionConfig.region,
	},
	async () => {
		const cutoff = Date.now() - WINDOW_MS;
		let totalWritten = 0;
		let lastDocId: string | undefined;

		// Page through active statements ordered by lastUpdate desc,
		// stopping when we hit a statement older than the cutoff.
		while (true) {
			let query = db
				.collection(Collections.statements)
				.where('lastUpdate', '>=', cutoff)
				.orderBy('lastUpdate', 'desc')
				.limit(PAGE_SIZE);

			if (lastDocId) {
				const lastDoc = await db.collection(Collections.statements).doc(lastDocId).get();
				if (lastDoc.exists) {
					query = query.startAfter(lastDoc);
				}
			}

			const snapshot = await query.get();
			if (snapshot.empty) break;

			for (const doc of snapshot.docs) {
				const statement = doc.data() as Statement;
				// Skip statements that have no evaluation yet — nothing to track
				if (!statement.evaluation) continue;

				const isResearch = await isResearchEnabledForTopParent(statement.topParentId);

				await writeHistoryEntry({
					statement,
					source: 'snapshot',
					isResearch,
				});
				totalWritten += 1;
			}

			if (snapshot.size < PAGE_SIZE) break;
			lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
		}

		logger.info(`[statementHistory] Hourly snapshot wrote ${totalWritten} entries`);
	},
);
