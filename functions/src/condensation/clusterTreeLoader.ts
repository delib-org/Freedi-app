import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import {
	CLUSTER_TREE_MAX_DEPTH,
	ClusterNode,
	ClusterStatementLike,
	buildClusterTree,
	isClusterLike,
} from './clusterTree';

/** Refs per `getAll` call, comfortably under Firestore's request limits. */
const GET_ALL_CHUNK = 100;

// Lazy init to avoid calling getFirestore() before initializeApp()
const db = () => getFirestore();

export async function fetchStatementsById(ids: string[]): Promise<Map<string, Statement | null>> {
	const found = new Map<string, Statement | null>();
	for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
		const refs = ids
			.slice(i, i + GET_ALL_CHUNK)
			.map((id) => db().collection(Collections.statements).doc(id));
		const snaps = await db().getAll(...refs);
		snaps.forEach((snap, index) => {
			found.set(refs[index].id, snap.exists ? (snap.data() as Statement) : null);
		});
	}

	return found;
}

/**
 * Build the member tree under an already-read root cluster by reading member
 * docs level by level: one batched `getAll` per level, and only members that
 * turn out to be clusters are expanded further. A theme whose members are
 * plain options costs one batch; theme -> synthesis -> options costs two.
 */
export async function loadClusterTree(
	rootId: string,
	root: ClusterStatementLike,
	maxDepth: number = CLUSTER_TREE_MAX_DEPTH,
): Promise<ClusterNode> {
	const known = new Map<string, ClusterStatementLike | null>([[rootId, root]]);
	let frontier = [...new Set(root.integratedOptions ?? [])];

	for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
		const toFetch = frontier.filter((id) => !known.has(id));
		const fetched = await fetchStatementsById(toFetch);
		fetched.forEach((statement, id) => known.set(id, statement));

		const next = new Set<string>();
		for (const id of frontier) {
			const statement = known.get(id);
			if (!statement || !isClusterLike(statement)) continue;
			(statement.integratedOptions ?? []).forEach((memberId) => next.add(memberId));
		}
		frontier = [...next];
	}

	return buildClusterTree(rootId, (id) => known.get(id) ?? undefined, { maxDepth });
}
