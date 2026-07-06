import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../db';
import {
	Collections,
	AgoraSessionStatus,
	AgoraStage,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * Hourly hygiene: auto-end sessions whose lesson window passed without the
 * teacher closing them (pattern: fn_handleVotingDeadline).
 */
export const agoraSessionSweep = onSchedule(
	{ schedule: '0 * * * *', region: functionConfig.region },
	async () => {
		try {
			const stale = await db
				.collection(Collections.agoraSessions)
				.where('status', 'in', [AgoraSessionStatus.open, AgoraSessionStatus.live])
				.where('lessonEndsAt', '<', Date.now())
				.get();

			if (stale.empty) return;

			const batch = db.batch();
			stale.docs.forEach((docSnap) => {
				batch.update(docSnap.ref, {
					stage: AgoraStage.ended,
					status: AgoraSessionStatus.ended,
					lastUpdate: Date.now(),
				});
			});
			await batch.commit();
			console.info(`[AgoraSweep] Auto-ended ${stale.size} stale sessions`);
		} catch (error) {
			logError(error, { operation: 'agora.sessionSweep' });
		}
	}
);
