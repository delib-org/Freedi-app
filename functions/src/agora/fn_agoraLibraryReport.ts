import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_LIBRARY_COMMUNITY,
	AgoraApprovedTeacher,
	AgoraLibraryReport,
	AgoraScenarioPost,
	AgoraScenarioRating,
	AgoraTopicPackage,
	Collections,
	LibraryReportRequest,
	LibraryReportResponse,
	createAgoraReportId,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { authorNameOf, countReport, markerRef, requireApprovedTeacher } from './libraryAccess';

/** The scenario a report is about, and whether the target is one a teacher can see (so reportable) */
async function locate(
	kind: LibraryReportRequest['targetKind'],
	targetId: string,
): Promise<string | null> {
	if (kind === 'scenario') {
		const pkg = (await db.collection(Collections.agoraTopicPackages).doc(targetId).get()).data() as
			| AgoraTopicPackage
			| undefined;

		return pkg?.library && pkg.visibility === 'public' && !pkg.library.hidden ? targetId : null;
	}
	if (kind === 'review') {
		const rating = (
			await db.collection(Collections.agoraScenarioRatings).doc(targetId).get()
		).data() as AgoraScenarioRating | undefined;

		return rating && !rating.hidden ? rating.scenarioId : null;
	}
	const post = (await db.collection(Collections.agoraScenarioPosts).doc(targetId).get()).data() as
		| AgoraScenarioPost
		| undefined;

	return post && !post.hidden ? post.scenarioId : null;
}

/**
 * A teacher reports a scenario, a review or a post to the system admins.
 * One report per teacher per target (the doc id), repeated reports are told
 * so and file nothing; a day's allowance keeps the queue honest. Reporting is
 * not hiding: the queue is where an admin decides.
 */
export const agoraLibraryReport = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<LibraryReportRequest>): Promise<LibraryReportResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { targetKind, targetId, reason } = request.data ?? ({} as LibraryReportRequest);
		if (targetKind !== 'scenario' && targetKind !== 'review' && targetKind !== 'post') {
			throw new HttpsError('invalid-argument', 'targetKind must be scenario, review or post');
		}
		if (!targetId || typeof targetId !== 'string') {
			throw new HttpsError('invalid-argument', 'targetId is required');
		}
		if (reason !== undefined && typeof reason !== 'string') {
			throw new HttpsError('invalid-argument', 'reason must be a string');
		}
		const why = (reason ?? '').trim().slice(0, AGORA_LIBRARY_COMMUNITY.REPORT_REASON_MAX);

		try {
			const scenarioId = await locate(targetKind, targetId);
			if (!scenarioId) throw new HttpsError('not-found', 'Nothing to report');
			const reporterName = await authorNameOf(uid);
			const reportRef = db
				.collection(Collections.agoraLibraryReports)
				.doc(createAgoraReportId(targetKind, targetId, uid));
			const now = Date.now();

			const existed = await db.runTransaction(async (transaction) => {
				const [reportSnap, markerSnap] = await Promise.all([
					transaction.get(reportRef),
					transaction.get(markerRef(uid)),
				]);
				if (reportSnap.exists) return true;
				const counted = countReport(
					markerSnap.data() as Partial<AgoraApprovedTeacher> | undefined,
					now,
				);
				if (!counted) throw new HttpsError('resource-exhausted', 'Report limit reached for today');
				const report: AgoraLibraryReport = {
					reportId: reportRef.id,
					targetKind,
					targetId,
					scenarioId,
					reporterId: uid,
					reporterName,
					reason: why,
					status: 'open',
					createdAt: now,
				};
				transaction.set(reportRef, report);
				transaction.set(markerRef(uid), counted, { merge: true });

				return false;
			});

			return { reportId: reportRef.id, existed };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryReport', userId: uid, metadata: { targetKind } });
			throw new HttpsError('internal', 'Failed to file the report');
		}
	},
);
