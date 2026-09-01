import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	functionConfig,
	resolveSessionFlow,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { computeSessionResults } from './classScore';

/**
 * Hourly hygiene: auto-end sessions whose lesson window passed without the
 * teacher closing them (pattern: fn_handleVotingDeadline).
 *
 * Ending is not enough on its own — the results screen waits on
 * `session.classScore` (or `session.convergence`), and a session flipped to
 * `ended` without one parks every open tab on the "computing" spinner
 * forever. So each swept session gets the same results computation the
 * advance-stage path runs.
 */
export const agoraSessionSweep = onSchedule(
	{ schedule: '0 * * * *', region: functionConfig.region, timeoutSeconds: 540 },
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

			// Sequential on purpose: computeSessionResults makes an AI call per
			// session, and the sweep rarely has more than a handful to close.
			for (const docSnap of stale.docs) {
				const session = docSnap.data() as AgoraSession;
				try {
					if (resolveSessionFlow(session).scoreMode === 'convergence') {
						if (!session.convergence) {
							await docSnap.ref.update({
								convergence: {
									before: null,
									after: null,
									score: null,
									participants: 0,
									computedAt: Date.now(),
								},
							});
						}
					} else if (!session.classScore) {
						await computeSessionResults(session.sessionId);
					}
				} catch (error) {
					logError(error, {
						operation: 'agora.sessionSweep.results',
						metadata: { sessionId: session.sessionId },
					});
				}
			}

			console.info(`[AgoraSweep] Auto-ended ${stale.size} stale sessions`);
		} catch (error) {
			logError(error, { operation: 'agora.sessionSweep' });
		}
	},
);
