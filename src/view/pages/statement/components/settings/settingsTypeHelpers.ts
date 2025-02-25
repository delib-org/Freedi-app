import { Statement } from '@/types/statement/StatementTypes';

export interface StatementSettingsProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}
