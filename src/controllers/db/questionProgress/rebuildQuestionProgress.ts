import { httpsCallable } from 'firebase/functions';
import { QuestionProgress } from '@freedi/shared-types';
import { functions } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';

const attempts = new Map<string, Promise<boolean>>();

async function requestRebuild(statementId: string): Promise<boolean> {
	try {
		const recompute = httpsCallable<{ statementId: string }, QuestionProgress>(
			functions,
			'fn_recomputeQuestionProgress',
		);
		await recompute({ statementId });

		return true;
	} catch (error) {
		logError(error, { operation: 'questionProgress.rebuildQuestionProgress', statementId });

		return false;
	}
}

/**
 * Rebuilds a question's counters from its source documents, at most once per
 * question in this session, because the rebuild reads every rating. Hosts only:
 * the server refuses anyone else. Resolves to whether the rebuild succeeded.
 */
export function rebuildQuestionProgressOnce(statementId: string): Promise<boolean> {
	const previous = attempts.get(statementId);
	if (previous) return previous;

	const attempt = requestRebuild(statementId);
	attempts.set(statementId, attempt);

	return attempt;
}
