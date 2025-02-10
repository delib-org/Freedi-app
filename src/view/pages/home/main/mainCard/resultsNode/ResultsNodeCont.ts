import { StatementType } from "@/types/enums";
import { Statement } from "@/types/statement";

export function styleSwitch(statement: Statement) {
	const { statementType } = statement;

	switch (statementType) {
		case StatementType.question:
			return "question";
		case StatementType.option:
			return "option";
		case StatementType.group:
			return "group";
		case StatementType.statement:
			return "statement";
		default:
			return "statement";
	}
}
