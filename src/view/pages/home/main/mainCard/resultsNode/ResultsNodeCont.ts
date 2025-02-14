import { StatementType } from '@/types/TypeEnums';
import { Statement } from '@/types/statement/Statement';

export function styleSwitch(statement: Statement) {
	const { statementType } = statement;

	switch (statementType) {
		case StatementType.question:
			return 'question';
		case StatementType.option:
			return 'option';
		case StatementType.group:
			return 'group';
		case StatementType.statement:
			return 'statement';
		default:
			return 'statement';
	}
}
