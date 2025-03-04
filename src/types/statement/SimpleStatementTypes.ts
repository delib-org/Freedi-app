import { InferOutput, number, object, optional, parse, string } from 'valibot';
import { Statement, StatementSchema } from './StatementTypes';
import { UserSchema } from '../user/User';

export const SimpleStatementSchema = object({
	statementId: string(),
	statement: string(),
	description: optional(string()),
	creatorId: string(),
	creator: UserSchema,
	imageURL: optional(string()),
	parentId: string(),
	topParentId: string(),
	consensus: number(),
	voted: optional(number()),
	totalSubStatements: optional(number()),
});

export type SimpleStatement = InferOutput<typeof SimpleStatementSchema>;

export function statementToSimpleStatement(
	statement: Statement
): SimpleStatement | undefined {
	try {
		if (!statement) throw new Error('statement is undefined');
		const _statement: Statement = parse(StatementSchema, statement);

		return {
			statementId: _statement.statementId,
			statement: _statement.statement,
			imageURL: _statement.imagesURL?.main || '',
			description: _statement.description,
			creatorId: _statement.creatorId,
			creator: _statement.creator,
			parentId: _statement.parentId,
			topParentId: _statement.topParentId,
			consensus: _statement.consensus || 0,
			voted: _statement.voted || 0,
			totalSubStatements: _statement.totalSubStatements || 0,
		};
	} catch (error) {
		console.error('error converting statement to simple statement', error);

		return undefined;
	}
}
