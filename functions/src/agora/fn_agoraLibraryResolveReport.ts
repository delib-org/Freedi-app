import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraLibraryReport,
	Collections,
	LibraryResolveReportRequest,
	LibraryResolveReportResponse,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { setPostHidden, setReviewHidden, setScenarioHidden } from './libraryModeration';

/**
 * A sys-admin closes the reports on one target: either by hiding it (the
 * reports then say `hidden`) or by dismissing them (`dismissed`, nothing
 * changes for the content). Every open report on that target is resolved
 * together; the reporters are not told which way it went.
 */
export const agoraLibraryResolveReport = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<LibraryResolveReportRequest>,
	): Promise<LibraryResolveReportResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'Only a system admin can resolve reports');
		}
		const { targetKind, targetId, resolution } =
			request.data ?? ({} as LibraryResolveReportRequest);
		if (targetKind !== 'scenario' && targetKind !== 'review' && targetKind !== 'post') {
			throw new HttpsError('invalid-argument', 'targetKind must be scenario, review or post');
		}
		if (!targetId || typeof targetId !== 'string') {
			throw new HttpsError('invalid-argument', 'targetId is required');
		}
		if (resolution !== 'hidden' && resolution !== 'dismissed') {
			throw new HttpsError('invalid-argument', 'resolution must be hidden or dismissed');
		}

		try {
			if (resolution === 'hidden') {
				const reason = 'reported';
				if (targetKind === 'scenario') {
					await setScenarioHidden({ scenarioId: targetId, hide: true, reason });
				} else if (targetKind === 'review') {
					await setReviewHidden({ ratingId: targetId, hide: true, reason });
				} else {
					await setPostHidden({ postId: targetId, hide: true, by: 'admin', reason });
				}
			}
			const open = await db
				.collection(Collections.agoraLibraryReports)
				.where('targetId', '==', targetId)
				.where('status', '==', 'open')
				.get();
			const batch = db.batch();
			const now = Date.now();
			let resolved = 0;
			for (const doc of open.docs) {
				if ((doc.data() as AgoraLibraryReport).targetKind !== targetKind) continue;
				batch.update(doc.ref, { status: 'resolved', resolution, resolvedBy: uid, resolvedAt: now });
				resolved += 1;
			}
			if (resolved > 0) await batch.commit();

			return { resolved };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.libraryResolveReport',
				userId: uid,
				metadata: { targetKind, targetId, resolution },
			});
			throw new HttpsError('internal', 'Failed to resolve the reports');
		}
	},
);
