import { InferOutput, number, object, optional, string } from 'valibot';
import { Statement } from './Statement';
import { CreatorSchema } from '../user/User';

export const SimpleStatementSchema = object({
	statementId: string(),
	statement: string(),
	description: optional(string()),
	creatorId: string(),
	creator: CreatorSchema,
	parentId: string(),
	consensus: number(),
	voted: optional(number()),
});

export type SimpleStatement = InferOutput<typeof SimpleStatementSchema>;

export function statementToSimpleStatement(
	statement: Statement
): SimpleStatement {
	const simple: SimpleStatement = {
		statementId: statement.statementId,
		statement: statement.statement,
		description: statement.description,
		creatorId: statement.creator.uid,
		creator: statement.creator,
		parentId: statement.parentId,
		consensus: statement.consensus,
		voted: statement.voted || 0,
	};

	return simple;
}
