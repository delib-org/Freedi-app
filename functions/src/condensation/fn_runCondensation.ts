import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	CondensationConfig,
	Evaluation,
	Statement,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { runCondensationPipeline } from './pipeline';
import { notifyAuthorsOfGrouping } from './authorNotifications';
import {
	findClustersAffectedByEvaluation,
	recomputeClusterEvaluation,
} from './aggregation';

const db = getFirestore();

/**
 * Callable: run the non-destructive condensation pipeline on demand.
 *
 * Input: { parentId: string, mode?: 'manual' | 'scheduled' }
 * Auth: user must be signed in.
 * Permission: only the parent's creator can trigger a manual run. (Admin
 * extension can be added later by reading subscription roles.)
 */
export const runCondensation = onCall(
	{ region: functionConfig.region },
	async (request) => {
		const { parentId, mode, dryRun } = (request.data ?? {}) as {
			parentId?: string;
			mode?: 'manual' | 'scheduled';
			dryRun?: boolean;
		};

		if (!request.auth?.uid) {
			throw new HttpsError('unauthenticated', 'Sign in required');
		}
		if (!parentId) {
			throw new HttpsError('invalid-argument', 'parentId is required');
		}

		const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
		if (!parentDoc.exists) {
			throw new HttpsError('not-found', 'Parent statement not found');
		}
		const parent = parentDoc.data() as Statement;

		if (parent.creatorId !== request.auth.uid && mode !== 'scheduled') {
			throw new HttpsError(
				'permission-denied',
				'Only the creator can trigger grouping for this question',
			);
		}

		const condensation: CondensationConfig | undefined =
			parent.statementSettings?.condensation;
		if (!condensation?.enabled) {
			throw new HttpsError(
				'failed-precondition',
				'Grouping is not enabled for this question',
			);
		}

		// Dry-run path — no writes, no lock, no status updates, no
		// notifications. Just compute the would-be groups and return.
		if (dryRun) {
			try {
				const result = await runCondensationPipeline(
					parentId,
					condensation,
					request.auth.uid,
					{ dryRun: true },
				);

				return {
					ok: true,
					dryRun: true,
					preview: result.preview ?? [],
					produced: result.produced,
					created: result.created,
					updated: result.updated,
					orphanedClusters: result.orphanedClusters,
				};
			} catch (error) {
				logError(error, {
					operation: 'runCondensation.dryRun',
					statementId: parentId,
					userId: request.auth.uid,
				});
				throw new HttpsError('internal', 'Preview failed');
			}
		}

		// Write lock (best-effort); rely on pipeline idempotency for correctness.
		const lockRef = db
			.collection(Collections.statements)
			.doc(parentId)
			.collection('locks')
			.doc('condensation');
		await lockRef.set(
			{
				lockedAt: FieldValue.serverTimestamp(),
				lockedBy: request.auth.uid,
			},
			{ merge: true },
		);

		try {
			await db.collection(Collections.statements).doc(parentId).update({
				condensationStatus: {
					isStale: false,
					lastRunBy: request.auth.uid,
					lastRunAt: Date.now(),
					level: condensation.level,
				},
				lastUpdate: Date.now(),
			});

			const result = await runCondensationPipeline(
				parentId,
				condensation,
				request.auth.uid,
			);

			await db.collection(Collections.statements).doc(parentId).update({
				condensationStatus: {
					isStale: false,
					lastRunBy: request.auth.uid,
					lastRunAt: Date.now(),
					level: condensation.level,
					inputCount: result.produced,
					producedGroupCount: result.created + result.updated,
				},
				lastUpdate: Date.now(),
			});

			// Fire author notifications (non-blocking from the callable's PoV).
			await notifyAuthorsOfGrouping(parent, result.affectedOriginals).catch((err) =>
				logError(err, {
					operation: 'runCondensation.notifyAuthors',
					statementId: parentId,
				}),
			);

			return { ok: true, ...result };
		} catch (error) {
			logError(error, {
				operation: 'runCondensation',
				statementId: parentId,
				userId: request.auth.uid,
			});
			await db
				.collection(Collections.statements)
				.doc(parentId)
				.update({
					condensationStatus: {
						isStale: true,
						error: error instanceof Error ? error.message : String(error),
					},
					lastUpdate: Date.now(),
				})
				.catch(() => {
					// best-effort
				});
			throw new HttpsError('internal', 'Condensation run failed');
		} finally {
			await lockRef.delete().catch(() => {
				// best-effort
			});
		}
	},
);

/**
 * Trigger: when an evaluation is written (created/updated/deleted), look up
 * any cluster statement that references the target via
 * `integratedOptions array-contains`, OR the target itself if it is a
 * cluster, and recompute its aggregated `StatementEvaluation`.
 *
 * This is the writeback path that makes the cluster card display aggregated
 * consensus/agreement/std/confidence from its members' evaluations without
 * client-side recomputation.
 */
export const onEvaluationChangeRecomputeCondensationClusters = onDocumentWritten(
	{
		document: `${Collections.evaluations}/{evaluationId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			const after = event.data?.after?.data() as Evaluation | undefined;
			const before = event.data?.before?.data() as Evaluation | undefined;
			const statementId = after?.statementId ?? before?.statementId;
			if (!statementId) return;

			const affected = await findClustersAffectedByEvaluation(statementId);
			if (affected.length === 0) return;

			for (const clusterId of affected) {
				try {
					await recomputeClusterEvaluation(clusterId);
				} catch (error) {
					logError(error, {
						operation: 'onEvaluationChangeRecomputeCondensationClusters.recompute',
						statementId: clusterId,
					});
				}
			}
		} catch (error) {
			logger.error(
				'condensation.onEvaluationChangeRecomputeCondensationClusters error',
				error,
			);
		}
	},
);

/**
 * Trigger: mark the parent question `condensationStatus.isStale = true` when
 * a new sibling statement is created under a parent that has condensation
 * enabled. The scheduled sweep (or manual run) will pick it up.
 *
 * This is deliberately lightweight — no pipeline work happens here.
 */
export const onStatementCreatedMarkCondensationStale = onDocumentWritten(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			if (!event.data?.after?.exists || event.data?.before?.exists) return;
			const created = event.data.after.data() as Statement;

			if (created.isCluster === true) return;
			if (!created.parentId) return;

			const parentRef = db.collection(Collections.statements).doc(created.parentId);
			const parentDoc = await parentRef.get();
			if (!parentDoc.exists) return;

			const parent = parentDoc.data() as Statement;
			const condensation = parent.statementSettings?.condensation;
			if (!condensation?.enabled) return;

			await parentRef.update({
				'condensationStatus.isStale': true,
				lastUpdate: Date.now(),
			}).catch(() => {
				// best-effort
			});
		} catch (error) {
			logger.error(
				'condensation.onStatementCreatedMarkCondensationStale error',
				error,
			);
		}
	},
);
