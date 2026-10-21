import { Collections } from '@freedi/shared-types';
import { FieldValue, Firestore } from 'firebase-admin/firestore';

/** Firestore allows at most 30 values in an `array-contains-any` filter. */
export const ARRAY_CONTAINS_ANY_MAX_VALUES = 30;

/** Firestore allows at most 500 writes in one batch. */
export const SUBSCRIPTION_TOKEN_BATCH_SIZE = 500;

/**
 * Removes the given FCM tokens from `statementsSubscribe.tokens[]` for one user.
 *
 * Only the user's subscriptions that actually contain one of the tokens are read
 * (`userId ==` + `tokens array-contains-any`, at most 30 tokens per query) and
 * written. The write is `arrayRemove` only: no `lastUpdate`, because clients order
 * subscriptions by `lastUpdate` and a cleanup is not user activity (it would also
 * wake every subscription trigger).
 *
 * Each pass reads at most one batch of documents and commits it before reading the
 * next, so memory stays bounded. A document updated in an earlier pass no longer
 * matches any chunk, which also dedupes documents across chunks.
 *
 * @returns the number of subscription documents updated.
 */
export async function removeTokensFromUserSubscriptions(
	db: Firestore,
	userId: string,
	tokens: string[],
): Promise<number> {
	const uniqueTokens = [...new Set(tokens)].filter((token) => token.length > 0);
	let updatedCount = 0;
	const updatedPaths = new Set<string>();

	for (let i = 0; i < uniqueTokens.length; i += ARRAY_CONTAINS_ANY_MAX_VALUES) {
		const chunk = uniqueTokens.slice(i, i + ARRAY_CONTAINS_ANY_MAX_VALUES);

		let hasMore = true;
		while (hasMore) {
			const snapshot = await db
				.collection(Collections.statementsSubscribe)
				.where('userId', '==', userId)
				.where('tokens', 'array-contains-any', chunk)
				.limit(SUBSCRIPTION_TOKEN_BATCH_SIZE)
				.get();

			// Guard against re-processing a document that is still returned (e.g. a lagging index).
			const freshDocs = snapshot.docs.filter((doc) => !updatedPaths.has(doc.ref.path));
			if (freshDocs.length === 0) break;

			const batch = db.batch();
			for (const doc of freshDocs) {
				batch.update(doc.ref, { tokens: FieldValue.arrayRemove(...uniqueTokens) });
				updatedPaths.add(doc.ref.path);
			}
			await batch.commit();
			updatedCount += freshDocs.length;

			hasMore = snapshot.size >= SUBSCRIPTION_TOKEN_BATCH_SIZE;
		}
	}

	return updatedCount;
}
