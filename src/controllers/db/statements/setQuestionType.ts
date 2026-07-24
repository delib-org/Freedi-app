import { getDoc, setDoc } from 'firebase/firestore';
import { QuestionType, Statement, StatementType } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError, ValidationError } from '@/utils/errorHandling';

export interface SetQuestionTypeResult {
	success: boolean;
	/**
	 * The question type before the write (defaults to `simple` when the
	 * question had none). Callers use it to Undo by setting it back.
	 */
	previousQuestionType?: QuestionType;
}

/**
 * Idempotently set `questionSettings.questionType` on a question statement
 * (Cross-App Statement Router → Mass-Consensus route, and its Undo).
 * Merge-write, so other `questionSettings` fields are preserved.
 */
export async function setQuestionType(
	statementId: string,
	questionType: QuestionType,
	userId?: string,
): Promise<SetQuestionTypeResult> {
	try {
		if (!statementId) {
			throw new ValidationError('Statement ID is undefined', {
				operation: 'statements.setQuestionType.setQuestionType',
			});
		}

		const statementRef = createStatementRef(statementId);
		const statementDB = await getDoc(statementRef);

		if (!statementDB.exists()) throw new Error('Statement not found');

		const statementData = statementDB.data() as Statement;

		if (statementData.statementType !== StatementType.question) {
			throw new ValidationError('Only questions can change question type', {
				operation: 'statements.setQuestionType.setQuestionType',
				statementId,
			});
		}

		const previousQuestionType =
			statementData.questionSettings?.questionType ?? QuestionType.simple;

		if (previousQuestionType === questionType) {
			return { success: true, previousQuestionType };
		}

		await setDoc(
			statementRef,
			{
				questionSettings: { questionType },
				lastUpdate: getCurrentTimestamp(),
			},
			{ merge: true },
		);

		return { success: true, previousQuestionType };
	} catch (error) {
		logError(error, {
			operation: 'statements.setQuestionType.setQuestionType',
			statementId,
			userId,
			metadata: { questionType },
		});

		return { success: false };
	}
}
