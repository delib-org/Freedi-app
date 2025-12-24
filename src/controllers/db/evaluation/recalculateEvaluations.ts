import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';

interface RecalculateRequest {
	statementId: string;
}

interface RecalculateResult {
	success: boolean;
	statementsProcessed: number;
	statementsFixed: number;
	errors: string[];
}

/**
 * Request recalculation of evaluation data for all options under a statement.
 * This recalculates counts based on actual evaluation documents, fixing any
 * inconsistencies caused by race conditions or duplicate trigger processing.
 *
 * @param statementId - The ID of the parent statement (question) to recalculate
 * @returns Result with counts of processed and fixed statements
 */
export async function requestRecalculateEvaluations(
	statementId: string
): Promise<RecalculateResult> {
	try {
		const recalculateEvaluations = httpsCallable<
			RecalculateRequest,
			RecalculateResult
		>(functions, 'recalculateStatementEvaluations');

		const result = await recalculateEvaluations({ statementId });

		logger.info('Evaluation recalculation completed', {
			statementId,
			statementsProcessed: result.data.statementsProcessed,
			statementsFixed: result.data.statementsFixed
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'recalculateEvaluations.requestRecalculateEvaluations',
			statementId,
		});
		throw error;
	}
}
