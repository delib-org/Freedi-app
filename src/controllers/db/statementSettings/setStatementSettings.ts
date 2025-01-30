import { Collections, Statement, StatementSettings, QuestionSettings, QuestionType } from "delib-npm";
import { doc, setDoc } from "firebase/firestore";
import { FireStore } from "../config";

interface SetStatementSettingsProps {
	statement: Statement,
	property: keyof (StatementSettings & QuestionSettings),
	newValue: boolean | string,
	settingsSection: keyof Statement
}

export function setStatementSettingToDB({ statement, property, newValue, settingsSection }: SetStatementSettingsProps) {
	try {

		const statementSettingsRef = doc(FireStore, Collections.statementsSettings, statement.statementId);
		setDoc(statementSettingsRef, {
			[settingsSection]: {
				[property]: newValue
			}
		}, { merge: true });
	} catch (error) {
		console.error(error);

	}
}

export function updateQuestionType({ statement, newValue }: { statement: Statement, newValue: QuestionType }) {
	try {

		const statementSettingsRef = doc(FireStore, Collections.statementsSettings, statement.statementId);
		setDoc(statementSettingsRef, {
			questionSettings: {
				questionType: newValue
			}
		}, { merge: true });
	} catch (error) {
		console.error(error);

	}
}