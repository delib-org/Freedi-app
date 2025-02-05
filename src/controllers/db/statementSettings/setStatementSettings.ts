import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { QuestionSettings } from '@/types/question';
import { Statement, StatementSettings } from '@/types/statement';
import { Collections } from '@/types/enums';

interface SetStatementSettingsProps {
	statement: Statement;
	property: keyof StatementSettings | keyof QuestionSettings;
	newValue: boolean;
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
			Collections.statementsSettings,
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
