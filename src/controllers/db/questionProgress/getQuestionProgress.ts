import { getDoc } from 'firebase/firestore';
import { safeParse } from 'valibot';
import { Collections, QuestionProgress, QuestionProgressSchema } from '@freedi/shared-types';
import { createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

/**
 * One read of a question's progress counters. Always a single `getDoc`, never
 * a listener: the document is written on every arrival and rating of a live
 * question. Failures resolve to null, because these counts are decoration.
 */
export async function getQuestionProgress(statementId: string): Promise<QuestionProgress | null> {
	try {
		const snapshot = await getDoc(createDocRef(Collections.questionProgress, statementId));
		if (!snapshot.exists()) return null;

		const parsed = safeParse(QuestionProgressSchema, snapshot.data());
		if (!parsed.success) {
			logError(new Error('Invalid question progress document'), {
				operation: 'questionProgress.getQuestionProgress.parse',
				statementId,
			});

			return null;
		}

		return parsed.output;
	} catch (error) {
		logError(error, { operation: 'questionProgress.getQuestionProgress', statementId });

		return null;
	}
}
