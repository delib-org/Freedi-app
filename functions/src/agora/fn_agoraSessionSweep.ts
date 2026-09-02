import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraSessionStatus,
	functionConfig,
	resolveStagePlan,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { advanceSession } from './stageAdvance';

/**
 * Hourly hygiene: auto-end sessions whose lesson window passed without the
 * teacher closing them (pattern: fn_handleVotingDeadline).
 *
 * Ending goes through the same `advanceSession` the teacher's button uses —
 * straight to the plan's terminal item — so `stageIndex` stays true to
 * `stage`, and the results the screen waits on (class score, agreement, or
 * an opened convergence) are computed by the same code path. A session
 * flipped to `ended` any other way parks every open tab on the "computing"
 * spinner forever.
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

			// Sequential on purpose: results can mean an AI call per session, and
			// the sweep rarely has more than a handful to close.
			for (const docSnap of stale.docs) {
				const session = docSnap.data() as AgoraSession;
				try {
					const plan = resolveStagePlan(session);
					const result = await advanceSession(
						session.sessionId,
						{ toIndex: plan.length - 1 },
						{ kind: 'sweep' },
					);
					if (!result.ok && result.reason !== 'stale') {
						logError(new Error(`sweep could not end session: ${result.reason}`), {
							operation: 'agora.sessionSweep.advance',
							metadata: { sessionId: session.sessionId },
						});
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
