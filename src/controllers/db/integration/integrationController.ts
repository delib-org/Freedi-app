import { httpsCallable, getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { app } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import type {
	FindSimilarForIntegrationResponse,
	ExecuteIntegrationParams,
	ExecuteIntegrationResponse,
} from '@/types/integration';
import { functionConfig } from '@freedi/shared-types';

// Get functions instance with correct region (me-west1)
const functionsWithRegion = getFunctions(app, functionConfig.region);

// Connect to emulator in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
	try {
		connectFunctionsEmulator(functionsWithRegion, 'localhost', 5001);
	} catch {
		// Already connected
	}
}

// Server-side these callables run with timeoutSeconds: 120 (see
// fn_integrateSimilarStatements.ts and fn_synthesizeIdeas.ts). The browser
// callable defaults to only 70s, which trips `deadline-exceeded` on cold
// LLM calls and large evaluation migrations. Match the server budget.
const INTEGRATION_TIMEOUT_MS = 120_000;

interface FindSimilarRequest {
	statementId: string;
}

/**
 * Find similar statements for integration
 * @param statementId - The ID of the statement to find similar ones for
 * @returns Source statement and array of similar statements with evaluation data
 */
export async function findSimilarForIntegration(
	statementId: string,
): Promise<FindSimilarForIntegrationResponse> {
	try {
		const findSimilar = httpsCallable<FindSimilarRequest, FindSimilarForIntegrationResponse>(
			functionsWithRegion,
			'findSimilarForIntegration',
			{ timeout: INTEGRATION_TIMEOUT_MS },
		);

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

interface ReverseIntegrationParams {
	clusterStatementId: string;
}

interface ReverseIntegrationResponse {
	success: boolean;
	clusterStatementId: string;
	restoredOriginalIds: string[];
	deletedEvaluationsCount: number;
}

interface RegenerateProposalParams {
	clusterStatementId: string;
}

interface RegenerateProposalResponse {
	success: boolean;
	clusterStatementId: string;
	cannotSynthesize?: boolean;
	splitReason?: string;
	splitProposal?: string[][];
	title?: string;
	description?: string;
	paragraphChildrenCreated?: number;
}

/**
 * Re-runs the synthesis-proposal LLM on an existing synthesis cluster and
 * replaces its title, description, and paragraph children. If the LLM
 * detects directional conflict, returns split metadata without writing.
 */
export async function regenerateSynthesisProposal(
	params: RegenerateProposalParams,
): Promise<RegenerateProposalResponse> {
	try {
		const regenerate = httpsCallable<RegenerateProposalParams, RegenerateProposalResponse>(
			functionsWithRegion,
			'regenerateSynthesisProposal',
			{ timeout: INTEGRATION_TIMEOUT_MS },
		);
		const result = await regenerate(params);

		logger.info('Synthesis proposal regenerated', {
			clusterStatementId: params.clusterStatementId,
			cannotSynthesize: result.data.cannotSynthesize === true,
			paragraphChildrenCreated: result.data.paragraphChildrenCreated,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'integrationController.regenerateSynthesisProposal',
			statementId: params.clusterStatementId,
		});
		throw error;
	}
}

/**
 * Reverses a synthesis / integration, restoring the originals and hiding
 * the cluster. Admin only.
 */
export async function reverseIntegration(
	params: ReverseIntegrationParams,
): Promise<ReverseIntegrationResponse> {
	try {
		const reverse = httpsCallable<ReverseIntegrationParams, ReverseIntegrationResponse>(
			functionsWithRegion,
			'reverseIntegration',
			{ timeout: INTEGRATION_TIMEOUT_MS },
		);

		const result = await reverse(params);

		logger.info('Synthesis reversed', {
			clusterStatementId: params.clusterStatementId,
			restored: result.data.restoredOriginalIds.length,
			deletedEvaluations: result.data.deletedEvaluationsCount,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'integrationController.reverseIntegration',
			statementId: params.clusterStatementId,
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
	params: ExecuteIntegrationParams,
): Promise<ExecuteIntegrationResponse> {
	try {
		const execute = httpsCallable<ExecuteIntegrationParams, ExecuteIntegrationResponse>(
			functionsWithRegion,
			'executeIntegration',
			{ timeout: INTEGRATION_TIMEOUT_MS },
		);

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
