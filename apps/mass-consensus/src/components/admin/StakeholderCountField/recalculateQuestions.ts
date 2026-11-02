import { RECALCULATE_CALL_TIMEOUT_MS } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';

export interface RecalculateOutcome {
	failedQuestionIds: string[];
}

/**
 * Ask the server to rescore every option under each question, one call per
 * question. A refusal (e.g. the caller may not recalculate) is collected, not
 * thrown, so the form can say so plainly and the other questions still run.
 */
export async function recalculateQuestions(
	surveyId: string,
	questionIds: string[],
): Promise<RecalculateOutcome> {
	// Loaded on click so the form does not pull the Firebase client in up front.
	const [{ httpsCallable }, { functions }] = await Promise.all([
		import('firebase/functions'),
		import('@/lib/firebase/functionsClient'),
	]);
	const recalculate = httpsCallable<{ statementId: string; surveyId: string }, { success: boolean }>(
		functions,
		'recalculateIndices',
		{ timeout: RECALCULATE_CALL_TIMEOUT_MS },
	);
	const failedQuestionIds: string[] = [];

	for (const questionId of questionIds) {
		try {
			// surveyId lets the server allow this survey's owner and editors for its questions
			await recalculate({ statementId: questionId, surveyId });
		} catch (error) {
			failedQuestionIds.push(questionId);
			logError(error, {
				operation: 'StakeholderCountField.recalculateQuestions',
				statementId: questionId,
				metadata: { surveyId },
			});
		}
	}

	return { failedQuestionIds };
}
