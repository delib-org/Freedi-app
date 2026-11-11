import { documentId, getDocs, query, where } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { store } from '@/redux/store';
import { setStatementMessageCounts } from '@/redux/statements/statementsSlice';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { FIREBASE } from '@/constants/common';

/**
 * One-shot read of `descendantMessageCount` for the statements Home shows.
 * Costs one document read per id (`in` queries, FIREBASE.IN_QUERY_LIMIT ids
 * each) and no listener: the subscription embeds a stale statement and the
 * server no longer refreshes it, so Home asks the statement itself.
 */
export async function fetchMessageCounts(statementIds: string[]): Promise<void> {
	try {
		const chunks: string[][] = [];
		for (let index = 0; index < statementIds.length; index += FIREBASE.IN_QUERY_LIMIT) {
			chunks.push(statementIds.slice(index, index + FIREBASE.IN_QUERY_LIMIT));
		}

		const snapshots = await Promise.all(
			chunks.map((chunk) =>
				getDocs(
					query(createCollectionRef(Collections.statements), where(documentId(), 'in', chunk)),
				),
			),
		);

		const counts: Array<{ statementId: string; count: number }> = [];
		snapshots.forEach((snapshot) =>
			snapshot.forEach((docSnap) => {
				const count = docSnap.data().descendantMessageCount;
				counts.push({ statementId: docSnap.id, count: typeof count === 'number' ? count : 0 });
			}),
		);
		if (counts.length > 0) store.dispatch(setStatementMessageCounts(counts));
	} catch (error) {
		const err = error as { code?: string };
		if (err?.code !== 'permission-denied') {
			logError(error, {
				operation: 'statements.fetchMessageCounts',
				metadata: { count: statementIds.length },
			});
		}
	}
}
