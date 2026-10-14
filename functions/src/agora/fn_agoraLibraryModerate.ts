import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AgoraScenarioRating,
	AgoraTopicPackage,
	Collections,
	LibraryModerateRequest,
	LibraryModerateResponse,
	applyRatingChange,
	emptyLibraryStats,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { globalMeanOf, libraryTotalsRef, readTotals, type LibraryTotals } from './libraryStats';

const REASON_MAX = 200;

/**
 * The smallest moderation the library ships with: a sys-admin can hide a
 * scenario or a review, and lift the hide again. Hidden is reversible and
 * leaves everything in place.
 *
 *  - A hidden scenario drops out of the library list; copies already taken
 *    are untouched, and its owner is told it was hidden.
 *  - A hidden review stops being shown AND stops counting in the scenario's
 *    stars; lifting the hide puts it back in.
 *
 * Reports, a queue, tag merging and the rest of moderation are a later phase;
 * this is the seam they will sit on.
 */
export const agoraLibraryModerate = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<LibraryModerateRequest>): Promise<LibraryModerateResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'Only a system admin can hide library content');
		}
		const { action, targetKind, targetId, reason } = request.data ?? ({} as LibraryModerateRequest);
		if (action !== 'hide' && action !== 'unhide') {
			throw new HttpsError('invalid-argument', 'action must be hide or unhide');
		}
		if (targetKind !== 'scenario' && targetKind !== 'review') {
			throw new HttpsError('invalid-argument', 'targetKind must be scenario or review');
		}
		if (!targetId || typeof targetId !== 'string') {
			throw new HttpsError('invalid-argument', 'targetId is required');
		}
		const hide = action === 'hide';
		const why = typeof reason === 'string' ? reason.trim().slice(0, REASON_MAX) : '';

		try {
			if (targetKind === 'scenario') {
				const ref = db.collection(Collections.agoraTopicPackages).doc(targetId);
				await db.runTransaction(async (transaction) => {
					const pkg = (await transaction.get(ref)).data() as AgoraTopicPackage | undefined;
					if (!pkg?.library) throw new HttpsError('not-found', 'Scenario not found');
					transaction.update(ref, {
						'library.hidden': hide,
						'library.hiddenReason': hide && why ? why : FieldValue.delete(),
					});
				});

				return { targetId, hidden: hide };
			}

			const ratingRef = db.collection(Collections.agoraScenarioRatings).doc(targetId);
			await db.runTransaction(async (transaction) => {
				const ratingSnap = await transaction.get(ratingRef);
				const rating = ratingSnap.data() as AgoraScenarioRating | undefined;
				if (!rating) throw new HttpsError('not-found', 'Review not found');
				const packageRef = db.collection(Collections.agoraTopicPackages).doc(rating.scenarioId);
				const [pkgSnap, totalsSnap] = await Promise.all([
					transaction.get(packageRef),
					transaction.get(libraryTotalsRef()),
				]);
				if (rating.hidden === hide) return;
				const pkg = pkgSnap.data() as AgoraTopicPackage | undefined;
				const totals = readTotals(totalsSnap.data() as Partial<LibraryTotals> | undefined);
				const mean = globalMeanOf(totals);
				const contribution = { stars: rating.stars, hasText: Boolean(rating.text) };

				transaction.update(ratingRef, {
					hidden: hide,
					hiddenReason: hide && why ? why : FieldValue.delete(),
				});
				if (pkg) {
					const current = pkg.stats ?? emptyLibraryStats(mean);
					transaction.update(packageRef, {
						stats: hide
							? applyRatingChange(current, contribution, null, mean)
							: applyRatingChange(current, null, contribution, mean),
					});
				}
				transaction.set(libraryTotalsRef(), {
					ratingTotal: Math.max(0, totals.ratingTotal + (hide ? -rating.stars : rating.stars)),
					ratingCount: Math.max(0, totals.ratingCount + (hide ? -1 : 1)),
				});
			});

			return { targetId, hidden: hide };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.libraryModerate',
				userId: uid,
				metadata: { action, targetKind, targetId },
			});
			throw new HttpsError('internal', 'Failed to moderate');
		}
	},
);
