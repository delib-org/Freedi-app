import { Statement } from '@/types/statement';

export interface StatementSettingsProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}
