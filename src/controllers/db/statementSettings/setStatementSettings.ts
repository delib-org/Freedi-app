import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import {
	StatementSettings,
	QuestionSettings,
	Statement,
	Collections,
	QuestionType,
} from 'delib-npm';

interface SetStatementSettingsProps {
	statement: Statement;
	property: keyof StatementSettings | keyof QuestionSettings;
	newValue: boolean | number;
	settingsSection: keyof Statement;
}

export function setStatementSettingToDB({
	statement,
	property,
	newValue,
	settingsSection,
}: SetStatementSettingsProps) {
	try {
		const statementSettingsRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);
		setDoc(
			statementSettingsRef,
			{
				[settingsSection]: {
					[property]: newValue,
				},
			},
			{ merge: true }
		);
	} catch (error) {
		console.error(error);
	}
}

interface SetQuestionTypeToDB {
	statement: Statement;
	questionType: QuestionType;
}

export function setQuestionTypeToDB({
	statement,
	questionType,
}: SetQuestionTypeToDB) {
	try {
		const statementSettingsRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);
		setDoc(
			statementSettingsRef,
			{
				questionSettings: {
					questionType: questionType,
				},
			},
			{ merge: true }
		);
	} catch (error) {
		console.error(error);
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
		const statementSettingsRef = doc(
			FireStore,
			Collections.statementsSettings,
			statement.statementId
		);
		setDoc(
			statementSettingsRef,
			{
				questionSettings: {
					questionType: newValue,
				},
			},
			{ merge: true }
		);
	} catch (error) {
		console.error(error);
	}
}
