import { setDoc } from 'firebase/firestore';
import { arrayUnion } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface LockStatementProps {
	statement: Statement;
	userId: string;
	parentStatementId?: string;
}

export async function lockStatement({
	statement,
	userId,
	parentStatementId,
}: LockStatementProps): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const statementRef = createStatementRef(statement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			statementRef,
			{
				locked: {
					isLocked: true,
					lockedBy: userId,
					lockedAt: now,
					lockedText: statement.statement,
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		if (parentStatementId) {
			const parentRef = createStatementRef(parentStatementId);
			await setDoc(
				parentRef,
				{
					questionSettings: {
						compoundSettings: {
							lockedSubQuestionIds: arrayUnion(statement.statementId),
						},
					},
					lastUpdate: now,
				},
				{ merge: true },
			);
		}
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.lockStatement',
			statementId: statement.statementId,
			userId,
		});
	}
}

interface UnlockStatementProps {
	statement: Statement;
}

export async function unlockStatement({ statement }: UnlockStatementProps): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const statementRef = createStatementRef(statement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			statementRef,
			{
				locked: {
					isLocked: false,
				},
				lastUpdate: now,
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.unlockStatement',
			statementId: statement.statementId,
		});
	}
}

export async function unlockCompoundTitle(statement: Statement): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const statementRef = createStatementRef(statement.statementId);
		const now = getCurrentTimestamp();

		await setDoc(
			statementRef,
			{
				questionSettings: {
					compoundSettings: {
						lockedTitle: null,
					},
				},
				locked: {
					isLocked: false,
				},
				lastUpdate: now,
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.unlockCompoundTitle',
			statementId: statement.statementId,
		});
	}
}

interface LockCompoundTitleProps {
	statement: Statement;
	userId: string;
	titleText?: string;
}

export async function lockCompoundTitle({
	statement,
	userId,
	titleText,
}: LockCompoundTitleProps): Promise<void> {
	try {
		if (!statement.statementId) throw new Error('Statement ID is required');

		const statementRef = createStatementRef(statement.statementId);
		const now = getCurrentTimestamp();
		const finalTitle = titleText || statement.statement;
		const scope = statement.questionSettings?.compoundSettings?.questionScope;

		await setDoc(
			statementRef,
			{
				statement: finalTitle,
				...(scope ? { brief: scope } : {}),
				questionSettings: {
					compoundSettings: {
						lockedTitle: {
							lockedText: finalTitle,
							lockedBy: userId,
							lockedAt: now,
						},
					},
				},
				locked: {
					isLocked: true,
					lockedBy: userId,
					lockedAt: now,
					lockedText: finalTitle,
				},
				lastUpdate: now,
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'compoundQuestion.lockCompoundTitle',
			statementId: statement.statementId,
			userId,
		});
	}
}
