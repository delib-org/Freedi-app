import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_TEACHER_SURFACES,
	AgoraTeacherSurface,
	AgoraTeacherUsageMonth,
	Collections,
	TeacherHeartbeatRequest,
	TeacherHeartbeatResponse,
	createAgoraTeacherUsageId,
	creditHeartbeat,
	dayKeyOf,
	functionConfig,
	monthKeyOf,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * The console's "still here" beat. The client says which surface is open and
 * how long it believes has passed; the server credits at most the wall-clock
 * gap (see `creditHeartbeat`) into the teacher's usage month. Only a signed-in
 * teacher's time counts — a student's anonymous session never reaches here.
 */
export const agoraTeacherHeartbeat = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TeacherHeartbeatRequest>): Promise<TeacherHeartbeatResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Only a signed-in teacher keeps hours');
		}

		const surface = request.data?.surface;
		const sinceMs = request.data?.sinceMs;
		if (!(AGORA_TEACHER_SURFACES as readonly string[]).includes(surface as string)) {
			throw new HttpsError('invalid-argument', 'Unknown surface');
		}
		if (typeof sinceMs !== 'number' || !Number.isFinite(sinceMs)) {
			throw new HttpsError('invalid-argument', 'sinceMs must be a finite number');
		}

		try {
			const now = Date.now();
			const month = monthKeyOf(now);
			const day = dayKeyOf(now);
			const ref = db
				.collection(Collections.agoraTeacherUsage)
				.doc(createAgoraTeacherUsageId(uid, month));

			return await db.runTransaction(async (transaction) => {
				const snap = await transaction.get(ref);
				const prev = snap.data() as AgoraTeacherUsageMonth | undefined;
				const { next, creditedMs } = creditHeartbeat(prev, {
					teacherId: uid,
					surface: surface as AgoraTeacherSurface,
					sinceMs,
					now,
				});
				if (next !== prev) transaction.set(ref, next);

				return { day, creditedMs, dayActiveMs: next.days[day]?.activeMs ?? 0 };
			});
		} catch (error) {
			logError(error, {
				operation: 'agora.teacherHeartbeat',
				userId: uid,
				metadata: { surface },
			});
			throw new HttpsError('internal', 'Failed to record the heartbeat');
		}
	},
);
