import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraPostHiddenBy,
	AgoraScenarioPost,
	AgoraScenarioRating,
	AgoraTopicPackage,
	Collections,
	applyRatingChange,
	emptyLibraryStats,
} from '@freedi/shared-types';
import {
	globalMeanOf,
	libraryTotalsRef,
	readTotals,
	currentGlobalMean,
	type LibraryTotals,
} from './libraryStats';

/**
 * The moderation writes the callables share, each one transaction so a hide
 * and the counter it moves cannot come apart.
 */

export interface PostHide {
	postId: string;
	hide: boolean;
	by: AgoraPostHiddenBy;
	reason: string;
}

/** Hide or show one post; the scenario's visible-post count follows. Idempotent. */
export async function setPostHidden(change: PostHide): Promise<void> {
	const globalMean = await currentGlobalMean();
	const postRef = db.collection(Collections.agoraScenarioPosts).doc(change.postId);
	await db.runTransaction(async (transaction) => {
		const postSnap = await transaction.get(postRef);
		const post = postSnap.data() as AgoraScenarioPost | undefined;
		if (!post) throw new HttpsError('not-found', 'Post not found');
		const packageRef = db.collection(Collections.agoraTopicPackages).doc(post.scenarioId);
		const pkg = (await transaction.get(packageRef)).data() as AgoraTopicPackage | undefined;
		if (post.hidden === change.hide) return;

		transaction.update(postRef, {
			hidden: change.hide,
			lastUpdate: Date.now(),
			hiddenBy: change.hide ? change.by : FieldValue.delete(),
			hiddenReason: change.hide && change.reason ? change.reason : FieldValue.delete(),
		});
		if (pkg) {
			const stats = pkg.stats ?? emptyLibraryStats(globalMean);
			transaction.update(packageRef, {
				stats: {
					...stats,
					postCount: Math.max(0, (stats.postCount ?? 0) + (change.hide ? -1 : 1)),
				},
			});
		}
	});
}

export interface ScenarioHide {
	scenarioId: string;
	hide: boolean;
	reason: string;
}

/**
 * Hide or show a scenario. The tag counters follow what the library lists
 * (public AND not hidden), so hiding takes one off every tag the scenario
 * carries and showing it puts one back. A scenario that is private right now
 * is not counted either way. Idempotent.
 */
export async function setScenarioHidden(change: ScenarioHide): Promise<void> {
	const ref = db.collection(Collections.agoraTopicPackages).doc(change.scenarioId);
	await db.runTransaction(async (transaction) => {
		const pkg = (await transaction.get(ref)).data() as AgoraTopicPackage | undefined;
		if (!pkg?.library) throw new HttpsError('not-found', 'Scenario not found');
		if ((pkg.library.hidden === true) === change.hide) return;
		const counted = pkg.visibility === 'public';
		const tagIds = counted ? [...pkg.library.subjectIds, ...pkg.library.lessonTypeIds] : [];
		const tagRefs = tagIds.map((id) => db.collection(Collections.agoraLibraryTags).doc(id));
		const tagSnaps = await Promise.all(tagRefs.map((tagRef) => transaction.get(tagRef)));

		transaction.update(ref, {
			'library.hidden': change.hide,
			'library.hiddenReason': change.hide && change.reason ? change.reason : FieldValue.delete(),
		});
		tagSnaps.forEach((snap, index) => {
			if (!snap.exists) return;
			transaction.update(tagRefs[index], {
				scenarioCount: FieldValue.increment(change.hide ? -1 : 1),
				lastUpdate: Date.now(),
			});
		});
	});
}

export interface ReviewHide {
	ratingId: string;
	hide: boolean;
	reason: string;
}

/**
 * Hide or show a review. A hidden review stops counting in the scenario's
 * stars and in the library's totals; showing it puts it back. Idempotent.
 */
export async function setReviewHidden(change: ReviewHide): Promise<void> {
	const ratingRef = db.collection(Collections.agoraScenarioRatings).doc(change.ratingId);
	await db.runTransaction(async (transaction) => {
		const rating = (await transaction.get(ratingRef)).data() as AgoraScenarioRating | undefined;
		if (!rating) throw new HttpsError('not-found', 'Review not found');
		const packageRef = db.collection(Collections.agoraTopicPackages).doc(rating.scenarioId);
		const [pkgSnap, totalsSnap] = await Promise.all([
			transaction.get(packageRef),
			transaction.get(libraryTotalsRef()),
		]);
		if (rating.hidden === change.hide) return;
		const pkg = pkgSnap.data() as AgoraTopicPackage | undefined;
		const totals = readTotals(totalsSnap.data() as Partial<LibraryTotals> | undefined);
		const mean = globalMeanOf(totals);
		const contribution = { stars: rating.stars, hasText: Boolean(rating.text) };

		transaction.update(ratingRef, {
			hidden: change.hide,
			hiddenReason: change.hide && change.reason ? change.reason : FieldValue.delete(),
		});
		if (pkg) {
			const current = pkg.stats ?? emptyLibraryStats(mean);
			transaction.update(packageRef, {
				stats: change.hide
					? applyRatingChange(current, contribution, null, mean)
					: applyRatingChange(current, null, contribution, mean),
			});
		}
		transaction.set(libraryTotalsRef(), {
			ratingTotal: Math.max(0, totals.ratingTotal + (change.hide ? -rating.stars : rating.stars)),
			ratingCount: Math.max(0, totals.ratingCount + (change.hide ? -1 : 1)),
		});
	});
}
