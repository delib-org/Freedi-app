import { Statement } from '@/types/statement/statementTypes';

export interface StatementSettingsProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}
