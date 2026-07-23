import { doc, setDoc } from 'firebase/firestore';
import { Statement, StatementSettings, Collections } from '@freedi/shared-types';
import { FireStore } from '@/controllers/db/config';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { setPowerFollowMeDB } from '@/controllers/db/statements/setStatements';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';

export interface StatementSettingsHandlers {
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
	handleHideChange: (newValue: boolean) => void;
	handleIsDocumentChange: (newValue: boolean) => void;
	handleDefaultLanguageChange: (newLanguage: string) => void;
	handleForceLanguageChange: (newValue: boolean) => void;
	handlePowerFollowMeChange: (newValue: boolean) => void;
}

/**
 * Shared instant-save handlers for the settings sub-components
 * (VisibilitySettings, ParticipationSettings, EvaluationSettings, etc.).
 * Every handler writes straight to Firestore — no Save button involved.
 */
export function useStatementSettingsHandlers(statement: Statement): StatementSettingsHandlers {
	const topParentStatement = useAppSelector(statementSelector(statement.topParentId));

	function handleSettingChange(
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) {
		setStatementSettingToDB({
			statement,
			property,
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	function handleHideChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { hide: newValue }, { merge: true });
	}

	function handleIsDocumentChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { isDocument: newValue, lastUpdate: Date.now() }, { merge: true });
	}

	function handleDefaultLanguageChange(newLanguage: string) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { defaultLanguage: newLanguage, lastUpdate: Date.now() }, { merge: true });
	}

	function handleForceLanguageChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { forceLanguage: newValue, lastUpdate: Date.now() }, { merge: true });
	}

	function handlePowerFollowMeChange(newValue: boolean) {
		const target = topParentStatement ?? statement;
		const path = newValue ? `/statement/${target.statementId}/chat` : '';
		setPowerFollowMeDB(target, path);
	}

	return {
		handleSettingChange,
		handleHideChange,
		handleIsDocumentChange,
		handleDefaultLanguageChange,
		handleForceLanguageChange,
		handlePowerFollowMeChange,
	};
}
