import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { ITEMS_SUBCOLLECTION, QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Pause / resume / cancel callables for an in-flight synthesis run.
 *
 * All three operate on the `synthesisQueue/{questionId}` progress doc; the
 * worker reads `status` on each tick and respects the value. Pause/resume
 * are cheap (one doc write); cancel does paginated batch deletes to clear
 * the items subcollection so the queue is fully drained.
 *
 * Cancel never undoes work already done — already-attached options keep
 * their cluster assignments. Only pending work is discarded.
 */

interface ControlRequest {
	questionId: string;
}

function db() {
	return getFirestore();
}

async function loadProgressForControl(questionId: string): Promise<ProgressDoc> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) {
		throw new HttpsError('not-found', 'No synthesis run found for this question');
	}

	return snap.data() as ProgressDoc;
}

export const synthesisPause = onCall<ControlRequest>(
	{
		timeoutSeconds: 30,
		memory: '256MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		await assertSynthesisAdmin(questionId, uid);
		const progress = await loadProgressForControl(questionId);
		if (progress.status !== 'running') {
			throw new HttpsError(
				'failed-precondition',
				`Cannot pause: current status is "${progress.status}"`,
			);
		}

		await db().collection(QUEUE_COLLECTION).doc(questionId).update({
			status: 'paused',
			lastTickAt: Date.now(),
		});
		logger.info('synthesisPause', { questionId, uid });

		return { paused: true };
	},
);

export const synthesisResume = onCall<ControlRequest>(
	{
		timeoutSeconds: 30,
		memory: '256MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		await assertSynthesisAdmin(questionId, uid);
		const progress = await loadProgressForControl(questionId);
		if (progress.status !== 'paused') {
			throw new HttpsError(
				'failed-precondition',
				`Cannot resume: current status is "${progress.status}"`,
			);
		}

		await db().collection(QUEUE_COLLECTION).doc(questionId).update({
			status: 'running',
			lastTickAt: Date.now(),
		});
		logger.info('synthesisResume', { questionId, uid });

		return { resumed: true };
	},
);

const CANCEL_DELETE_PAGE_SIZE = 400;

export const synthesisCancel = onCall<ControlRequest>(
	{
		timeoutSeconds: 540,
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		await assertSynthesisAdmin(questionId, uid);
		const progress = await loadProgressForControl(questionId);
		if (progress.status === 'completed' || progress.status === 'cancelled') {
			throw new HttpsError(
				'failed-precondition',
				`Cannot cancel: current status is "${progress.status}"`,
			);
		}

		await db().collection(QUEUE_COLLECTION).doc(questionId).update({
			status: 'cancelled',
			cancelledBy: uid,
			cancelledAt: Date.now(),
			lastTickAt: Date.now(),
		});

		// Paginated delete of remaining items so a huge queue doesn't blow the
		// 500-write batch limit.
		const itemsRef = db()
			.collection(QUEUE_COLLECTION)
			.doc(questionId)
			.collection(ITEMS_SUBCOLLECTION);

		let deleted = 0;
		while (true) {
			const snap = await itemsRef.limit(CANCEL_DELETE_PAGE_SIZE).get();
			if (snap.empty) break;
			const batch = db().batch();
			for (const doc of snap.docs) batch.delete(doc.ref);
			await batch.commit();
			deleted += snap.size;
			if (snap.size < CANCEL_DELETE_PAGE_SIZE) break;
		}

		logger.info('synthesisCancel', { questionId, uid, deletedItems: deleted });

		return { cancelled: true, deletedItems: deleted };
	},
);
