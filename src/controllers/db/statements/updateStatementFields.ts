import { getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { FireStore } from '../config';
import {
	Statement,
	StatementSchema,
	StatementType,
	QuestionType,
	Membership,
	ResultsBy,
	EvaluationUI,
	Paragraph,
} from '@freedi/shared-types';

import { parse } from 'valibot';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { resultsSettingsDefault } from './setStatements';

interface UpdateStatementProps {
	text: string;
	paragraphs?: Paragraph[];
	statement: Statement;
	statementType?: StatementType;
	enableAddEvaluationOption?: boolean;
	enableAddVotingOption?: boolean;
	enhancedEvaluation?: boolean;
	showEvaluation?: boolean;
	resultsBy?: ResultsBy;
	numberOfResults?: number;
	hasChildren?: boolean;
	membership?: Membership;
}

interface UpdateStatementSettingsReturnType {
	enableAddEvaluationOption?: boolean;
	enableAddVotingOption?: boolean;
	enhancedEvaluation?: boolean;
	showEvaluation?: boolean;
}

interface UpdateStatementSettingsParams {
	statement: Statement;
	enableAddEvaluationOption: boolean;
	enableAddVotingOption: boolean;
	enhancedEvaluation: boolean;
	showEvaluation: boolean;
}

function updateStatementSettings({
	statement,
	enableAddEvaluationOption,
	enableAddVotingOption,
	enhancedEvaluation,
	showEvaluation,
}: UpdateStatementSettingsParams): UpdateStatementSettingsReturnType {
	const defaultSettings = {
		showEvaluation: true,
		enableAddEvaluationOption: true,
		enableAddVotingOption: true,
	};

	if (!statement) {
		return defaultSettings;
	}

	return {
		...(statement.statementSettings || defaultSettings),
		enhancedEvaluation,
		showEvaluation,
		enableAddEvaluationOption,
		enableAddVotingOption,
	};
}

export function updateStatement({
	text,
	paragraphs,
	statement,
	statementType,
	enableAddEvaluationOption,
	enableAddVotingOption,
	enhancedEvaluation,
	showEvaluation,
	resultsBy,
	numberOfResults,
	hasChildren,
	membership,
}: UpdateStatementProps): Statement | undefined {
	try {
		const newStatement: Statement = JSON.parse(JSON.stringify(statement));

		if (text) newStatement.statement = text;
		if (paragraphs) newStatement.paragraphs = paragraphs;

		newStatement.lastUpdate = getCurrentTimestamp();

		if (resultsBy && newStatement.resultsSettings)
			newStatement.resultsSettings.resultsBy = resultsBy;
		else if (resultsBy && !newStatement.resultsSettings) {
			newStatement.resultsSettings = resultsSettingsDefault;
		}
		if (numberOfResults && newStatement.resultsSettings)
			newStatement.resultsSettings.numberOfResults = Number(numberOfResults);
		else if (numberOfResults && !newStatement.resultsSettings) {
			newStatement.resultsSettings = resultsSettingsDefault;
		}

		newStatement.statementSettings = updateStatementSettings({
			statement,
			enableAddEvaluationOption,
			enableAddVotingOption,
			enhancedEvaluation,
			showEvaluation,
		});

		newStatement.hasChildren = hasChildren;
		// Only update membership if explicitly provided
		// Otherwise keep the existing membership (which might be undefined for inheritance)
		if (membership !== undefined) {
			newStatement.membership = membership;
		}

		if (statementType) newStatement.statementType = statementType;

		return parse(StatementSchema, newStatement);
	} catch (error) {
		logError(error, { operation: 'statements.updateStatementFields.updateStatement' });

		return undefined;
	}
}

export async function updateStatementText(
	statement: Statement | undefined,
	title?: string,
	paragraphs?: Paragraph[],
) {
	try {
		if (!statement) throw new Error('Statement is undefined');

		const updates: Partial<Statement> = {};
		if (title !== undefined && statement.statement !== title) {
			updates.statement = title;
		}
		if (paragraphs !== undefined) {
			updates.paragraphs = paragraphs;
		}

		// If statement lacks topParentId, derive it from parent
		if (!statement.topParentId && statement.parentId) {
			const parentRef = createStatementRef(statement.parentId);
			const parentDoc = await getDoc(parentRef);
			if (parentDoc.exists()) {
				const parentData = parentDoc.data() as Statement;
				updates.topParentId = parentData.topParentId || parentData.statementId;
			}
		}

		if (Object.keys(updates).length === 0) {
			return;
		}

		updates.lastUpdate = getCurrentTimestamp();

		const statementRef = createStatementRef(statement.statementId);

		await updateDoc(statementRef, updates);
	} catch (error) {
		logError(error, { operation: 'statements.updateStatementFields.updateStatementText' });
	}
}

/**
 * Update statement paragraphs array for rich text editing
 * @param statement - The statement to update
 * @param paragraphs - Array of paragraphs to save
 */
export async function updateStatementParagraphs(
	statement: Statement | undefined,
	paragraphs: Paragraph[],
): Promise<void> {
	try {
		if (!statement) throw new Error('Statement is undefined');
		if (!paragraphs) throw new Error('Paragraphs array is undefined');

		const updates: Partial<Statement> = {
			paragraphs,
			lastUpdate: getCurrentTimestamp(),
		};

		const statementRef = createStatementRef(statement.statementId);

		await updateDoc(statementRef, updates);
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementFields.updateStatementParagraphs',
			metadata: { message: 'Error updating statement paragraphs:' },
		});
		throw error;
	}
}

export async function setStatementIsOption(statement: Statement | undefined) {
	try {
		if (!statement) throw new Error('Statement is undefined');

		const statementRef = createStatementRef(statement.statementId);

		await runTransaction(FireStore, async (transaction) => {
			const statementDB = await transaction.get(statementRef);

			if (!statementDB.exists()) throw new Error('Statement not found');

			const statementDBData = parse(StatementSchema, statementDB.data());

			const newType =
				statementDBData.statementType === StatementType.option
					? StatementType.statement
					: StatementType.option;

			transaction.update(statementRef, { statementType: newType });
		});
	} catch (error) {
		logError(error, { operation: 'statements.updateStatementFields.setStatementIsOption' });
	}
}

export async function updateIsQuestion(statement: Statement) {
	try {
		const statementRef = createStatementRef(statement.statementId);

		let { statementType } = statement;
		if (statementType === StatementType.question) {
			statementType = StatementType.statement;
		} else {
			statementType = StatementType.question;
			statement.questionSettings = {
				...statement.questionSettings,
				questionType: QuestionType.simple,
			};
			statement.evaluationSettings = {
				...statement.evaluationSettings,
				evaluationUI: EvaluationUI.suggestions,
			};
		}

		const newStatementType = { statementType };
		await updateDoc(statementRef, newStatementType);
	} catch (error) {
		logError(error, { operation: 'statements.updateStatementFields.updateIsQuestion' });
	}
}

export async function updateStatementMainImage(statement: Statement, imageURL: string | undefined) {
	try {
		if (!imageURL) throw new Error('Image URL is undefined');
		const statementRef = createStatementRef(statement.statementId);

		// Use nested field update to preserve other imagesURL fields like displayMode
		await updateDoc(statementRef, {
			'imagesURL.main': imageURL,
		});
	} catch (error) {
		logError(error, { operation: 'statements.updateStatementFields.updateStatementMainImage' });
	}
}

export async function updateStatementImageDisplayMode(
	statement: Statement,
	displayMode: 'above' | 'inline',
) {
	try {
		const statementRef = createStatementRef(statement.statementId);

		await updateDoc(statementRef, {
			'imagesURL.displayMode': displayMode,
		});
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementFields.updateStatementImageDisplayMode',
		});
	}
}

export async function setStatementGroupToDB(statement: Statement) {
	try {
		const { setDoc } = await import('firebase/firestore');
		const statementId = statement.statementId;
		const statementRef = createStatementRef(statementId);
		await setDoc(statementRef, { statementType: StatementType.statement }, { merge: true });
	} catch (error) {
		logError(error, { operation: 'statements.updateStatementFields.setStatementGroupToDB' });
	}
}
