import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';

/** Firestore's limit on the values of one `in` filter. */
const IN_QUERY_LIMIT = 30;

/** The direct children of these statements, a query per 30 parents. */
export async function childrenOf(
	firestore: Firestore,
	parentIds: readonly string[],
): Promise<QueryDocumentSnapshot[]> {
	const statements = firestore.collection(Collections.statements);
	const found: QueryDocumentSnapshot[] = [];
	for (let start = 0; start < parentIds.length; start += IN_QUERY_LIMIT) {
		const chunk = parentIds.slice(start, start + IN_QUERY_LIMIT);
		const snapshot = await statements.where('parentId', 'in', chunk).get();
		found.push(...snapshot.docs);
	}

	return found;
}

export interface SubtreeWalk {
	visited: number;
	/** The walk stopped at `max`: what is further down was not seen. */
	truncated: boolean;
}

/**
 * Visits a statement and everything filed under it, one level of `parentId` at
 * a time, nearest first, so a level is always handled before its children. Each
 * statement is visited once, so a loop ends. Stops after `max` statements.
 */
export async function walkSubtree(
	firestore: Firestore,
	rootId: string,
	visit: (level: QueryDocumentSnapshot[]) => Promise<void>,
	max: number,
): Promise<SubtreeWalk> {
	const root = await firestore.collection(Collections.statements).doc(rootId).get();
	if (!root.exists) return { visited: 0, truncated: false };

	const seen = new Set<string>();
	let level = [root as QueryDocumentSnapshot];
	while (level.length > 0) {
		const fresh = level.filter((doc) => !seen.has(doc.id)).slice(0, max - seen.size);
		if (fresh.length === 0) break;
		fresh.forEach((doc) => seen.add(doc.id));
		await visit(fresh);
		if (seen.size >= max) return { visited: seen.size, truncated: true };
		level = await childrenOf(
			firestore,
			fresh.map((doc) => doc.id),
		);
	}

	return { visited: seen.size, truncated: false };
}
