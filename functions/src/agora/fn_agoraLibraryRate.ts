import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_LIBRARY,
	AgoraScenarioRating,
	AgoraTopicPackage,
	Collections,
	LibraryRateRequest,
	LibraryRateResponse,
	applyRatingChange,
	createAgoraRatingId,
	emptyLibraryStats,
	functionConfig,
	isValidStars,
} from '@freedi/shared-types';
import { containsBadLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
import { authorNameOf, requireApprovedTeacher } from './libraryAccess';
import { globalMeanOf, libraryTotalsRef, readTotals, type LibraryTotals } from './libraryStats';

/**
 * Rate a library scenario: 1-5 stars and, if you like, a few words.
 *
 * Any approved teacher may rate any listed scenario but their own. One rating
 * per teacher per scenario (the document id is `{scenarioId}__{teacherId}`),
 * and rating again edits it. The aggregates on the scenario (`stats`) and the
 * library-wide totals move in the same transaction as the rating itself, so
 * they cannot drift from the documents they summarise, and nothing ever
 * counts ratings on read.
 *
 * A rating an admin has hidden stays hidden when its author edits it, and
 * does not count in the stats: hiding is the admin's to lift.
 */
export const agoraLibraryRate = onCall(
	{ region: functionConfig.region, timeoutSeconds: 60 },
	async (request: CallableRequest<LibraryRateRequest>): Promise<LibraryRateResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { scenarioId, stars, text } = request.data ?? ({} as LibraryRateRequest);
		if (!scenarioId || typeof scenarioId !== 'string') {
			throw new HttpsError('invalid-argument', 'scenarioId is required');
		}
		if (!isValidStars(stars)) {
			throw new HttpsError('invalid-argument', 'stars must be a whole number from 1 to 5');
		}
		if (text !== undefined && typeof text !== 'string') {
			throw new HttpsError('invalid-argument', 'text must be a string');
		}
		const review = (text ?? '').trim().slice(0, AGORA_LIBRARY.REVIEW_MAX);
		if (review && (await containsBadLanguage(review))) {
			throw new HttpsError('invalid-argument', 'That review is not allowed');
		}

		try {
			const authorName = await authorNameOf(uid);
			const packageRef = db.collection(Collections.agoraTopicPackages).doc(scenarioId);
			const ratingRef = db
				.collection(Collections.agoraScenarioRatings)
				.doc(createAgoraRatingId(scenarioId, uid));
			const now = Date.now();

			const stats = await db.runTransaction(async (transaction) => {
				const [pkgSnap, ratingSnap, totalsSnap] = await Promise.all([
					transaction.get(packageRef),
					transaction.get(ratingRef),
					transaction.get(libraryTotalsRef()),
				]);
				const pkg = pkgSnap.data() as AgoraTopicPackage | undefined;
				if (!pkg || pkg.visibility !== 'public' || !pkg.library || pkg.library.hidden) {
					throw new HttpsError('not-found', 'Scenario not found');
				}
				if (pkg.creatorId === uid) {
					throw new HttpsError('permission-denied', 'You cannot rate your own scenario');
				}
				const previous = ratingSnap.data() as AgoraScenarioRating | undefined;
				const totals = readTotals(totalsSnap.data() as Partial<LibraryTotals> | undefined);
				const mean = globalMeanOf(totals);
				const current = pkg.stats ?? emptyLibraryStats(mean);
				const hidden = previous?.hidden === true;

				const rating: AgoraScenarioRating = {
					ratingId: ratingRef.id,
					scenarioId,
					teacherId: uid,
					authorName,
					stars,
					...(review ? { text: review } : {}),
					hidden,
					...(previous?.hiddenReason ? { hiddenReason: previous.hiddenReason } : {}),
					createdAt: previous?.createdAt ?? now,
					lastUpdate: now,
				};
				// A hidden rating is outside the numbers, before and after
				const next = hidden
					? current
					: applyRatingChange(
							current,
							previous ? { stars: previous.stars, hasText: Boolean(previous.text) } : null,
							{ stars, hasText: Boolean(review) },
							mean,
						);
				transaction.set(ratingRef, rating);
				transaction.update(packageRef, { stats: next });
				if (!hidden) {
					transaction.set(libraryTotalsRef(), {
						ratingTotal: totals.ratingTotal + stars - (previous?.stars ?? 0),
						ratingCount: totals.ratingCount + (previous ? 0 : 1),
					});
				}

				return next;
			});

			return { stats };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryRate', userId: uid, metadata: { scenarioId } });
			throw new HttpsError('internal', 'Failed to save the rating');
		}
	},
);
