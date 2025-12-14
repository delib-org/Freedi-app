import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import type {
	FindSimilarForIntegrationResponse,
	ExecuteIntegrationParams,
	ExecuteIntegrationResponse,
} from '@/types/integration';

interface FindSimilarRequest {
	statementId: string;
}

/**
 * Find similar statements for integration
 * @param statementId - The ID of the statement to find similar ones for
 * @returns Source statement and array of similar statements with evaluation data
 */
export async function findSimilarForIntegration(
	statementId: string
): Promise<FindSimilarForIntegrationResponse> {
	try {
		const findSimilar = httpsCallable<
			FindSimilarRequest,
			FindSimilarForIntegrationResponse
		>(functions, 'findSimilarForIntegration');

		const result = await findSimilar({ statementId });

		logger.info('Found similar statements for integration', {
			statementId,
			similarCount: result.data.similarStatements.length,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'integrationController.findSimilarForIntegration',
			statementId,
		});
		throw error;
	}
}

/**
 * Execute integration of similar statements
 * Creates new integrated statement, migrates evaluations, hides originals
 * @param params - Integration parameters
 * @returns Integration result with new statement ID and metrics
 */
export async function executeIntegration(
	params: ExecuteIntegrationParams
): Promise<ExecuteIntegrationResponse> {
	try {
		const execute = httpsCallable<
			ExecuteIntegrationParams,
			ExecuteIntegrationResponse
		>(functions, 'executeIntegration');

		const result = await execute(params);

		logger.info('Integration executed successfully', {
			parentStatementId: params.parentStatementId,
			selectedCount: params.selectedStatementIds.length,
			newStatementId: result.data.newStatementId,
			migratedEvaluations: result.data.migratedEvaluationsCount,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'integrationController.executeIntegration',
			statementId: params.parentStatementId,
			metadata: {
				selectedStatementIds: params.selectedStatementIds,
			},
		});
		throw error;
	}
}
