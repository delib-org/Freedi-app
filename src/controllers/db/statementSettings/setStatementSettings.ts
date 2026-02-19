import { setDoc } from 'firebase/firestore';
import {
	StatementSettings,
	QuestionSettings,
	Statement,
	Collections,
	QuestionType,
} from '@freedi/shared-types';
import { createStatementRef, createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface SetStatementSettingsProps {
	statement: Statement;
	property: keyof StatementSettings | keyof QuestionSettings;
	newValue: boolean | number | string;
	settingsSection: keyof Statement;
}

export function setStatementSettingToDB({
	statement,
	property,
	newValue,
	settingsSection,
}: SetStatementSettingsProps) {
	try {
		const statementSettingsRef = createStatementRef(statement.statementId);
		setDoc(
			statementSettingsRef,
			{
				[settingsSection]: {
					[property]: newValue,
				},
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, { operation: 'statementSettings.setStatementSettings.setStatementSettingToDB' });
	}
}

interface SetQuestionTypeToDB {
	statement: Statement;
	questionType: QuestionType;
}

export function setQuestionTypeToDB({ statement, questionType }: SetQuestionTypeToDB) {
	try {
		const statementSettingsRef = createStatementRef(statement.statementId);
		setDoc(
			statementSettingsRef,
			{
				questionSettings: {
					questionType: questionType,
				},
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, { operation: 'statementSettings.setStatementSettings.setQuestionTypeToDB' });
	}
}

export function updateQuestionType({
	statement,
	newValue,
}: {
	statement: Statement;
	newValue: QuestionType;
}) {
	try {
		const statementSettingsRef = createDocRef(
			Collections.statementsSettings,
			statement.statementId,
		);
		setDoc(
			statementSettingsRef,
			{
				questionSettings: {
					questionType: newValue,
				},
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, { operation: 'statementSettings.setStatementSettings.updateQuestionType' });
	}
}
