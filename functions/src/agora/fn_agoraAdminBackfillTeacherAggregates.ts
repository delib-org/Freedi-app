import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraParticipant,
	AgoraSession,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraTeacherAggregate,
	BackfillTeacherAggregatesRequest,
	BackfillTeacherAggregatesResponse,
	Collections,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { foldTeacherLessonTx } from './aggregates';

const DEFAULT_PAGE = 200;
const MAX_PAGE = 500;

/** Did this session finish, by any of the three signals the trigger listens for? */
function isFinished(session: AgoraSession): boolean {
	return (
		session.status === AgoraSessionStatus.ended ||
		session.classScore?.computedAt !== undefined ||
		session.agreement?.computedAt !== undefined
	);
}

/**
 * Fold the games that finished before teacher aggregates existed, one page of
 * sessions per call. Sys-admin only; the caller loops on `nextCursor`.
 *
 * Each candidate is folded in its own transaction that re-reads the session
 * and bails if `teacherAggregatedAt` appeared meanwhile — the live trigger
 * may be stamping the same session — and stamps ONLY `teacherAggregatedAt`:
 * `aggregatedAt` belongs to the class/career fold and is left exactly as it
 * was.
 */
export const agoraAdminBackfillTeacherAggregates = onCall(
	{ region: functionConfig.region, timeoutSeconds: 540 },
	async (
		request: CallableRequest<BackfillTeacherAggregatesRequest>,
	): Promise<BackfillTeacherAggregatesResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'System admin required');
		}

		const { cursor, limit, dryRun } = request.data ?? {};
		const pageSize =
			typeof limit === 'number' && Number.isFinite(limit)
				? Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE)
				: DEFAULT_PAGE;

		try {
			let query = db.collection(Collections.agoraSessions).orderBy('createdAt').limit(pageSize);
			if (typeof cursor === 'number' && Number.isFinite(cursor)) {
				query = query.startAfter(cursor);
			}
			const pageSnaps = await query.get();
			const sessions = pageSnaps.docs.map((snap) => snap.data() as AgoraSession);

			let folded = 0;
			let skipped = 0;
			for (const session of sessions) {
				if (
					session.sessionMode === AgoraSessionMode.civic ||
					!isFinished(session) ||
					session.teacherAggregatedAt !== undefined
				) {
					skipped += 1;
					continue;
				}
				if (dryRun) {
					folded += 1;
					continue;
				}

				const participantSnaps = await db
					.collection(Collections.agoraParticipants)
					.where('sessionId', '==', session.sessionId)
					.get();
				const studentCount = participantSnaps.docs
					.map((doc) => doc.data() as AgoraParticipant)
					.filter((participant) => !participant.isAI).length;

				const sessionRef = db.collection(Collections.agoraSessions).doc(session.sessionId);
				const teacherAggRef = db
					.collection(Collections.agoraTeacherAggregates)
					.doc(session.teacherId);
				const didFold = await db.runTransaction(async (transaction) => {
					const [freshSnap, aggSnap] = await Promise.all([
						transaction.get(sessionRef),
						transaction.get(teacherAggRef),
					]);
					const fresh = freshSnap.data() as AgoraSession | undefined;
					if (!fresh || fresh.teacherAggregatedAt !== undefined) return false;
					const now = Date.now();
					foldTeacherLessonTx(
						transaction,
						fresh,
						studentCount,
						aggSnap.data() as AgoraTeacherAggregate | undefined,
						now,
					);
					transaction.update(sessionRef, { teacherAggregatedAt: now });

					return true;
				});
				if (didFold) folded += 1;
				else skipped += 1;
			}

			const last = sessions[sessions.length - 1];

			return {
				processed: sessions.length,
				folded,
				skipped,
				...(sessions.length === pageSize && last ? { nextCursor: last.createdAt } : {}),
			};
		} catch (error) {
			logError(error, {
				operation: 'agora.adminBackfillTeacherAggregates',
				userId: uid,
				metadata: { cursor, limit, dryRun },
			});
			throw new HttpsError('internal', 'Backfill failed');
		}
	},
);
