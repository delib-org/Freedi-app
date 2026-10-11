import {
	and,
	getDocs,
	limit,
	or,
	orderBy,
	query,
	where,
	type DocumentData,
} from 'firebase/firestore';
import {
	Collections,
	isSearchCandidate,
	isTopLevelSearchCandidate,
	subscriptionToSearchCandidate,
	type SearchCandidate,
	type SearchableSubscription,
} from '@freedi/shared-types';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { SEARCH } from '@/constants/common';
import { logError, DatabaseError } from '@/utils/errorHandling';

export interface SubscriptionCandidates {
	candidates: SearchCandidate[];
	/** True when the download hit the limit — older subscriptions exist beyond it. */
	truncated: boolean;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Firestore Timestamps survive in legacy docs; search only needs a number to sort by. */
function asMillis(value: unknown): number | undefined {
	if (typeof value === 'number') return value;
	if (value && typeof value === 'object' && 'toMillis' in value) {
		const toMillis = (value as { toMillis: unknown }).toMillis;
		if (typeof toMillis === 'function') return (toMillis as () => number).call(value);
	}

	return undefined;
}

/** Only the fields search reads, each checked — never a blind cast of the doc. */
export function toSearchableSubscription(data: DocumentData): SearchableSubscription | null {
	const statementId = asString(data.statementId);
	if (!statementId) return null;

	const embedded =
		data.statement && typeof data.statement === 'object' ? (data.statement as DocumentData) : null;

	return {
		statementId,
		role: data.role,
		parentId: asString(data.parentId),
		topParentId: asString(data.topParentId),
		statementType: data.statementType,
		lastUpdate: asMillis(data.lastUpdate),
		isDocument: data.isDocument === true,
		statement: embedded
			? {
					statement: asString(embedded.statement),
					description: asString(embedded.description),
					statementType: embedded.statementType,
					parentId: asString(embedded.parentId),
					lastUpdate: asMillis(embedded.lastUpdate),
					createdAt: asMillis(embedded.createdAt),
				}
			: undefined,
	};
}

/**
 * Download the caller's subscriptions as search candidates, most recently
 * updated first, up to SEARCH.SUBSCRIPTIONS_CANDIDATE_LIMIT. One-shot read —
 * the results go into the search cache, never into the home list (whose
 * lazy-load cursors would break).
 */
export async function fetchSubscriptionCandidates(
	userId: string,
	topLevelOnly: boolean,
): Promise<SubscriptionCandidates> {
	try {
		const subscriptions = createCollectionRef(Collections.statementsSubscribe);
		const max = SEARCH.SUBSCRIPTIONS_CANDIDATE_LIMIT;

		// Same filter as the home listener, so it uses the indexes that already serve it.
		const q = topLevelOnly
			? query(
					subscriptions,
					and(
						where('userId', '==', userId),
						or(where('parentId', '==', 'top'), where('statement.parentId', '==', 'top')),
					),
					orderBy('lastUpdate', 'desc'),
					limit(max),
				)
			: query(
					subscriptions,
					where('userId', '==', userId),
					orderBy('lastUpdate', 'desc'),
					limit(max),
				);

		const snapshot = await getDocs(q);
		const candidates = snapshot.docs
			.map((doc) => toSearchableSubscription(doc.data()))
			.filter((subscription): subscription is SearchableSubscription => subscription !== null)
			.map(subscriptionToSearchCandidate)
			.filter(isSearchCandidate)
			.filter((candidate) => !topLevelOnly || isTopLevelSearchCandidate(candidate));

		return { candidates, truncated: snapshot.docs.length >= max };
	} catch (error) {
		logError(error, {
			operation: 'search.getSearchCandidates.fetchSubscriptionCandidates',
			userId,
			metadata: { topLevelOnly },
		});
		throw new DatabaseError('Could not load subscriptions for search', {
			operation: 'search.getSearchCandidates.fetchSubscriptionCandidates',
			userId,
		});
	}
}
