import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections, Role, StatementType, functionConfig } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import {
	findSimilarAndGenerateSuggestion,
	mapStatementToWithEvaluation,
	StatementWithEvaluation,
} from './services/integration-ai-service';
import { performIntegration } from './integrate/performIntegration';
import { reverseIntegration } from './integrate/reverseIntegration';
import { ALLOWED_ORIGINS } from './config/cors';

/**
 * Request type for finding similar statements for integration
 */
interface FindSimilarForIntegrationRequest {
	statementId: string;
}

/**
 * Response type for finding similar statements for integration
 */
interface FindSimilarForIntegrationResponse {
	sourceStatement: StatementWithEvaluation;
	similarStatements: StatementWithEvaluation[];
	suggestedTitle?: string;
	suggestedDescription?: string;
}

/**
 * Request type for executing integration
 */
interface ExecuteIntegrationRequest {
	parentStatementId: string;
	selectedStatementIds: string[];
	integratedTitle: string;
	integratedDescription: string;
}

/**
 * Response type for executing integration
 */
interface ExecuteIntegrationResponse {
	success: boolean;
	newStatementId: string;
	migratedEvaluationsCount: number;
	hiddenStatementsCount: number;
}

/**
 * Firebase callable function to find similar statements for integration
 * Admin only - finds statements similar to the selected one
 */
export const findSimilarForIntegration = onCall<FindSimilarForIntegrationRequest>(
	{
		timeoutSeconds: 120,
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<FindSimilarForIntegrationResponse> => {
		const { statementId } = request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		if (!statementId) {
			throw new HttpsError('invalid-argument', 'Statement ID is required');
		}

		const db = getFirestore();

		// 1. Fetch source statement first (needed for subsequent queries)
		const sourceDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!sourceDoc.exists) {
			throw new HttpsError('not-found', 'Statement not found');
		}
		const sourceStatement = sourceDoc.data() as Statement;
		const parentId = sourceStatement.parentId;
		const topParentId = sourceStatement.topParentId || parentId;

		// 2. PARALLEL: Fetch admin check, parent, and siblings simultaneously
		const [membersSnapshot, parentDoc, siblingsSnapshot] = await Promise.all([
			db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', topParentId)
				.where('userId', '==', userId)
				.where('role', 'in', [Role.admin, 'creator', 'admin'])
				.limit(1)
				.get(),
			db.collection(Collections.statements).doc(parentId).get(),
			db
				.collection(Collections.statements)
				.where('parentId', '==', parentId)
				.where('statementType', '==', StatementType.option)
				.get(),
		]);

		const isAdmin = !membersSnapshot.empty;
		const isCreator = sourceStatement.creatorId === userId;

		if (!isAdmin && !isCreator) {
			throw new HttpsError('permission-denied', 'Only admins can integrate suggestions');
		}

		const parentStatement = parentDoc.exists ? (parentDoc.data() as Statement) : null;
		const questionContext = parentStatement?.statement || '';
		const allSiblings = siblingsSnapshot.docs.map((doc) => doc.data() as Statement);

		logger.info(`Found ${allSiblings.length} sibling statements for integration check`);

		// 3. SINGLE AI CALL: Find similar AND generate suggestion in one request
		const result = await findSimilarAndGenerateSuggestion(
			sourceStatement,
			allSiblings,
			questionContext,
		);

		return {
			sourceStatement: mapStatementToWithEvaluation(sourceStatement),
			similarStatements: result.similarStatements,
			suggestedTitle: result.suggestedTitle,
			suggestedDescription: result.suggestedDescription,
		};
	},
);

/**
 * Firebase callable function to execute integration of similar statements
 * Creates new integrated statement, migrates evaluations, hides originals
 */
export const executeIntegration = onCall<ExecuteIntegrationRequest>(
	{
		timeoutSeconds: 120, // May take longer with many evaluations to migrate
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<ExecuteIntegrationResponse> => {
		const { parentStatementId, selectedStatementIds, integratedTitle, integratedDescription } =
			request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		if (!parentStatementId || !selectedStatementIds || selectedStatementIds.length === 0) {
			throw new HttpsError('invalid-argument', 'Parent ID and selected statement IDs are required');
		}

		if (!integratedTitle || integratedTitle.trim().length === 0) {
			throw new HttpsError('invalid-argument', 'Integrated title is required');
		}

		const db = getFirestore();

		const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
		if (!parentDoc.exists) {
			throw new HttpsError('not-found', 'Parent statement not found');
		}
		const parentStatement = parentDoc.data() as Statement;
		const topParentId = parentStatement.topParentId || parentStatementId;

		const membersSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', topParentId)
			.where('userId', '==', userId)
			.where('role', 'in', [Role.admin, 'creator', 'admin'])
			.limit(1)
			.get();

		if (membersSnapshot.empty) {
			throw new HttpsError('permission-denied', 'Only admins can execute integration');
		}

		const adminDoc = await db.collection('usersV2').doc(userId).get();
		const adminData = adminDoc.exists ? adminDoc.data() : null;

		try {
			const result = await performIntegration({
				parentStatementId,
				selectedStatementIds,
				integratedTitle,
				integratedDescription,
				creatorId: userId,
				creatorDisplayName: adminData?.displayName || 'Admin',
				creatorDefaultLanguage: adminData?.defaultLanguage || 'en',
			});
			logger.info('executeIntegration completed', result);

			return {
				success: true,
				newStatementId: result.newStatementId,
				migratedEvaluationsCount: result.migratedEvaluationsCount,
				hiddenStatementsCount: result.hiddenStatementsCount,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			const message = error instanceof Error ? error.message : 'Integration failed';
			throw new HttpsError('internal', message);
		}
	},
);

interface ReverseIntegrationRequest {
	clusterStatementId: string;
}

interface ReverseIntegrationResponse {
	success: boolean;
	clusterStatementId: string;
	restoredOriginalIds: string[];
	deletedEvaluationsCount: number;
}

/**
 * Reverses an integration / synthesis. Admin only. Restores originals,
 * removes migrated evaluations on the cluster, and hides the cluster.
 * The cluster doc is preserved for audit (`reversedAt`, `reversedBy`).
 */
export const reverseIntegrationCallable = onCall<ReverseIntegrationRequest>(
	{
		timeoutSeconds: 120,
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<ReverseIntegrationResponse> => {
		const { clusterStatementId } = request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!clusterStatementId) {
			throw new HttpsError('invalid-argument', 'clusterStatementId is required');
		}

		const db = getFirestore();
		const clusterDoc = await db.collection(Collections.statements).doc(clusterStatementId).get();
		if (!clusterDoc.exists) {
			throw new HttpsError('not-found', 'Cluster not found');
		}
		const cluster = clusterDoc.data() as Statement;
		if (cluster.isCluster !== true) {
			throw new HttpsError('failed-precondition', 'Statement is not a cluster');
		}

		// Authorize against the top-level deliberation, mirroring executeIntegration.
		const topParentId = cluster.topParentId || cluster.parentId;
		if (!topParentId) {
			throw new HttpsError('failed-precondition', 'Cluster has no parent context');
		}
		const membersSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', topParentId)
			.where('userId', '==', userId)
			.where('role', 'in', [Role.admin, 'creator', 'admin'])
			.limit(1)
			.get();
		if (membersSnapshot.empty) {
			throw new HttpsError('permission-denied', 'Only admins can reverse a synthesis');
		}

		try {
			const result = await reverseIntegration({
				clusterStatementId,
				reversedByUserId: userId,
			});
			logger.info('reverseIntegrationCallable completed', result);

			return {
				success: true,
				clusterStatementId: result.clusterStatementId,
				restoredOriginalIds: result.restoredOriginalIds,
				deletedEvaluationsCount: result.deletedEvaluationsCount,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			const message = error instanceof Error ? error.message : 'Reverse synthesis failed';
			throw new HttpsError('internal', message);
		}
	},
);
