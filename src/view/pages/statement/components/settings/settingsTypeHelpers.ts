import { Statement, StatementSettings } from '@freedi/shared-types';

export interface StatementSettingsProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

export type SettingChangeHandler = (
	property: keyof StatementSettings,
	newValue: boolean | string | number,
) => void;

/** Which page composes the settings form: the legacy page or the Host hub. */
export type SettingsVariant = 'legacy' | 'hub';
