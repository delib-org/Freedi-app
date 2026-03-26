import { writeBatch, arrayUnion } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import {
	Statement,
	StatementType,
	QuestionType,
	createStatementObject,
} from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

/**
 * Derives a deterministic sub-question ID from the source option and target parent.
 *
 * This ensures that promoting the same option to the same parent always produces
 * the same Firestore document ID, making the operation naturally idempotent.
 * Multiple calls (from StrictMode, multiple tabs, or rapid re-renders) simply
 * overwrite the same document rather than creating duplicates.
 */
function derivePromotedSubQuestionId(optionId: string, parentId: string): string {
	return `promoted__${optionId}__${parentId}`;
}

/**
 * Promotes a discussion option to a sub-question under the parent compound question.
 *
 * Idempotency guarantees:
 * 1. The sub-question's statementId is deterministic (derived from optionId + parentId),
 *    so duplicate calls overwrite the same document.
 * 2. arrayUnion(optionId) is naturally idempotent -- adding the same value twice is a no-op.
 * 3. Both writes are in a single batch -- either both succeed or both fail (no orphans).
 *
 * @throws Re-throws on failure so the caller can clear its dedup guard and allow retry.
 */
export async function promoteOptionToSubQuestion(
	option: Statement,
	parentStatement: Statement,
): Promise<void> {
	try {
		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!creator) throw new Error('Creator is required');

		const deterministicId = derivePromotedSubQuestionId(
			option.statementId,
			parentStatement.statementId,
		);

		const subQuestion = createStatementObject({
			statement: option.statement,
			statementType: StatementType.question,
			parentId: parentStatement.statementId,
			topParentId: parentStatement.topParentId || parentStatement.statementId,
			creatorId: creator.uid,
			creator,
			statementId: deterministicId,
		});

		if (!subQuestion) throw new Error('Failed to create sub-question from option');

		const batch = writeBatch(FireStore);

		// Write 1: Create (or overwrite) the sub-question document
		const subQuestionRef = createStatementRef(subQuestion.statementId);
		batch.set(subQuestionRef, {
			...subQuestion,
			questionSettings: {
				questionType: QuestionType.simple,
			},
		});

		// Write 2: Add the option ID to the parent's promotedOptionIds (idempotent via arrayUnion)
		const parentRef = createStatementRef(parentStatement.statementId);
		batch.set(
			parentRef,
			{
				questionSettings: {
					compoundSettings: {
						promotedOptionIds: arrayUnion(option.statementId),
					},
				},
				lastUpdate: getCurrentTimestamp(),
			},
			{ merge: true },
		);

		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.promoteOptionToSubQuestion',
			statementId: option.statementId,
			metadata: { parentStatementId: parentStatement.statementId },
		});
		throw error;
	}
}
