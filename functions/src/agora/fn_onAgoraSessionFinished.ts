import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Collections, AgoraSession, functionConfig } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { bumpAgoraStats, writeSessionAggregates } from './aggregates';
import { isNewlyFinishedSession } from './sessionFinish';

/**
 * When a session finishes, fold it into the career/class aggregates and the
 * sys-admin period stats — exactly once.
 *
 * "Finished" arrives on two different writes and every session produces at
 * least one of them:
 *  - `classScore` appearing (computeSessionResults, at the results stage or
 *    from the hourly sweep) — the scored, bridging path;
 *  - `status` flipping to ended — the convergence path and sweep-ended
 *    sessions that never reached results.
 * A session can produce BOTH (scored at results, ended later): the
 * `aggregatedAt` guard inside writeSessionAggregates makes the second a no-op,
 * and the stats bump only runs when the folding actually happened.
 *
 * Civic sessions are skipped entirely — they are the Odyssey square's
 * always-on rooms, not classroom games, and would drown the class KPIs.
 */
export const onAgoraSessionFinished = onDocumentUpdated(
	{ document: `${Collections.agoraSessions}/{sessionId}`, region: functionConfig.region },
	async (event) => {
		const before = event.data?.before.data() as AgoraSession | undefined;
		const after = event.data?.after.data() as AgoraSession | undefined;
		if (!before || !after) return;
		if (!isNewlyFinishedSession(before, after)) return;

		try {
			const themes = await writeSessionAggregates(after.sessionId);
			if (themes) {
				// Student count mirrors what writeSessionAggregates counted; a
				// re-read here would race late writes, and participantCount on the
				// session already excludes nothing — so recount is done inside the
				// aggregation and the stats use the session's own counter, which
				// the join transaction has kept AI-free all along.
				await bumpAgoraStats(after, after.participantCount, themes);
			}
		} catch (error) {
			logError(error, {
				operation: 'agora.onAgoraSessionFinished',
				metadata: { sessionId: after.sessionId },
			});
		}
	},
);
