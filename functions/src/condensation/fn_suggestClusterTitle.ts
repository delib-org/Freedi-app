import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, functionConfig } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generateGroupedTitle } from './titleGeneration';

const db = getFirestore();

/**
 * Callable: generate a fresh AI title suggestion for a cluster.
 *
 * Input: { clusterId: string }
 * Auth: caller must be the cluster's parent-question creator.
 *
 * Pure suggestion — this function does NOT mutate the cluster. The client
 * decides whether to apply it (via `updateClusterTitle` with `lockTitle: true`).
 * This separation is important: admin approves, or edits, or dismisses.
 */
export const suggestClusterTitle = onCall(
	{ region: functionConfig.region, cors: true },
	async (request) => {
		const { clusterId } = (request.data ?? {}) as { clusterId?: string };

		if (!request.auth?.uid) {
			throw new HttpsError('unauthenticated', 'Sign in required');
		}
		if (!clusterId) {
			throw new HttpsError('invalid-argument', 'clusterId is required');
		}

		const clusterDoc = await db.collection(Collections.statements).doc(clusterId).get();
		if (!clusterDoc.exists) {
			throw new HttpsError('not-found', 'Cluster not found');
		}
		const cluster = clusterDoc.data() as Statement;

		if (cluster.isCluster !== true) {
			throw new HttpsError('failed-precondition', 'Target statement is not a cluster');
		}

		// Permission: only the parent question's creator can request suggestions.
		const parentId = cluster.parentId;
		const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
		if (!parentDoc.exists) {
			throw new HttpsError('not-found', 'Parent question not found');
		}
		const parent = parentDoc.data() as Statement;
		if (parent.creatorId !== request.auth.uid) {
			throw new HttpsError(
				'permission-denied',
				'Only the question creator can request title suggestions',
			);
		}

		const memberIds = cluster.integratedOptions ?? [];
		if (memberIds.length < 2) {
			throw new HttpsError(
				'failed-precondition',
				'Cluster must have at least two members to generate a suggestion',
			);
		}

		try {
			// Fetch member texts (batched — Firestore `in` limit is 30).
			const memberTexts: string[] = [];
			const BATCH = 30;
			for (let i = 0; i < memberIds.length; i += BATCH) {
				const batch = memberIds.slice(i, i + BATCH);
				const snap = await db
					.collection(Collections.statements)
					.where('__name__', 'in', batch.map((id) => db.collection(Collections.statements).doc(id)))
					.get()
					.catch(() => null);
				if (snap) {
					snap.docs.forEach((doc) => {
						const data = doc.data() as Statement;
						if (data.statement) memberTexts.push(data.statement);
					});
				} else {
					// Fallback: per-doc fetch.
					for (const id of batch) {
						const d = await db.collection(Collections.statements).doc(id).get();
						const data = d.data() as Statement | undefined;
						if (data?.statement) memberTexts.push(data.statement);
					}
				}
			}

			if (memberTexts.length < 2) {
				throw new HttpsError(
					'failed-precondition',
					'Could not fetch enough members to generate a suggestion',
				);
			}

			const { title, description } = await generateGroupedTitle(
				memberTexts,
				parent.statement ?? '',
			);

			return { ok: true, title, description };
		} catch (error) {
			logError(error, {
				operation: 'condensation.suggestClusterTitle',
				statementId: clusterId,
				userId: request.auth.uid,
			});
			throw new HttpsError('internal', 'Failed to generate title suggestion');
		}
	},
);
