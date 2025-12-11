import { Statement } from '@freedi/shared-types';

export interface StatementSettingsProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}
