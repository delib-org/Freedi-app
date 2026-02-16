import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';

interface RecalculateRequest {
	statementId: string;
	dryRun?: boolean;
}

interface StatementFix {
	statementId: string;
	statementText?: string;
	isClusterOption?: boolean;
	before: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
	after: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
}

interface RecalculateResult {
	success: boolean;
	dryRun: boolean;
	statementsProcessed: number;
	statementsFixed: number;
	fixes: StatementFix[];
	errors: string[];
}

/**
 * Request recalculation of evaluation data for all options under a statement.
 * This recalculates counts based on actual evaluation documents, fixing any
 * inconsistencies caused by race conditions or duplicate trigger processing.
 *
 * @param statementId - The ID of the parent statement (question) to recalculate
 * @param dryRun - If true, only report what would change without applying
 * @returns Result with counts of processed and fixed statements, and detailed fixes
 */
export async function requestRecalculateEvaluations(
	statementId: string,
	dryRun: boolean = false,
): Promise<RecalculateResult> {
	try {
		const recalculateEvaluations = httpsCallable<RecalculateRequest, RecalculateResult>(
			functions,
			'recalculateStatementEvaluations',
		);

		const result = await recalculateEvaluations({ statementId, dryRun });

		const modeLabel = dryRun ? '[DRY RUN] ' : '';
		logger.info(`${modeLabel}Evaluation recalculation completed`, {
			statementId,
			dryRun,
			statementsProcessed: result.data.statementsProcessed,
			statementsFixed: result.data.statementsFixed,
			fixesCount: result.data.fixes.length,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'recalculateEvaluations.requestRecalculateEvaluations',
			statementId,
			metadata: { dryRun },
		});
		throw error;
	}
}
