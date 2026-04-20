import { onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { ClusterEvaluationLink, Collections } from '@freedi/shared-types';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { store } from '@/redux/store';
import { replaceForCluster } from '@/redux/clusterEvaluationLinks/clusterEvaluationLinksSlice';
import { logError } from '@/utils/errorHandling';

/**
 * Subscribe to every provenance link doc for a single cluster. Each snapshot
 * fully replaces the Redux state for that cluster so stale links are
 * purged automatically (important after server-side prune writes).
 */
export function listenToClusterEvaluationLinks(clusterId: string | undefined): Unsubscribe {
	if (!clusterId) return () => {};
	try {
		const ref = createCollectionRef(Collections.clusterEvaluationLinks);
		const q = query(ref, where('clusterId', '==', clusterId));

		return onSnapshot(
			q,
			(snap) => {
				const links: ClusterEvaluationLink[] = [];
				snap.forEach((doc) => {
					links.push(doc.data() as ClusterEvaluationLink);
				});
				store.dispatch(replaceForCluster({ clusterId, links }));
			},
			(error) => {
				logError(error, {
					operation: 'listenToClusterEvaluationLinks.onError',
					statementId: clusterId,
				});
			},
		);
	} catch (error) {
		logError(error, {
			operation: 'listenToClusterEvaluationLinks',
			statementId: clusterId,
		});

		return () => {};
	}
}
