import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import { CLUSTER_TREE_MAX_DEPTH } from './clusterTree';

// Lazy init to avoid calling getFirestore() before initializeApp()
const db = () => getFirestore();

/** Ids of the clusters that list `statementId` as a member or absorbed cluster. */
async function findDirectParents(statementId: string): Promise<string[]> {
	const [membersSnap, absorbingSnap] = await Promise.all([
		db()
			.collection(Collections.statements)
			.where('integratedOptions', 'array-contains', statementId)
			.get(),
		db()
			.collection(Collections.statements)
			.where('absorbedClusterIds', 'array-contains', statementId)
			.get(),
	]);

	return [...membersSnap.docs, ...absorbingSnap.docs].map((doc) => doc.id);
}

/**
 * Given an evaluation write, find every cluster statement that needs a
 * recompute: the target itself if it is a cluster, and ALL its ancestors.
 *
 * A vote on a plain option inside a synthesis inside a theme reaches both the
 * synthesis and the theme (the score is nested; see `clusterTree.ts`). Parents
 * are found through `integratedOptions` and `absorbedClusterIds`
 * (array-contains), hopping upward until no new ancestor appears, at most
 * `CLUSTER_TREE_MAX_DEPTH` levels, deduped.
 */
export async function findClustersAffectedByEvaluation(statementId: string): Promise<string[]> {
	const affected = new Set<string>();

	// The evaluation was on a cluster statement itself.
	const targetDoc = await db().collection(Collections.statements).doc(statementId).get();
	if (targetDoc.exists && (targetDoc.data() as Statement).isCluster === true) {
		affected.add(statementId);
	}

	// Walk up: parents of the target, then parents of those, and so on.
	const visited = new Set<string>([statementId]);
	let frontier = [statementId];
	for (let hop = 0; hop < CLUSTER_TREE_MAX_DEPTH && frontier.length > 0; hop++) {
		const parentLists = await Promise.all(frontier.map(findDirectParents));
		const next = new Set<string>();
		for (const parentId of parentLists.flat()) {
			affected.add(parentId);
			if (!visited.has(parentId)) {
				visited.add(parentId);
				next.add(parentId);
			}
		}
		frontier = [...next];
	}

	return Array.from(affected);
}
