import { array, BaseSchema, enum_, InferOutput, lazy, number, object, optional, string } from 'valibot';
import { Statement } from './StatementTypes';
import { UserSchema } from '../user/User';
import { StatementType } from '../TypeEnums';
import { ParagraphSchema } from '../paragraph/paragraphModel';

export const SimpleStatementSchema: BaseSchema<any, any, any> = object({
	statementId: string(),
	statement: string(),
	statementType: enum_(StatementType),
	paragraphs: optional(array(ParagraphSchema)),
	creatorId: string(),
	creator: UserSchema,
	parentId: string(),
	consensus: number(),
	lastUpdate: optional(number()),
	createdAt: optional(number()),
	imageURL: optional(string()),
	voted: optional(number()),
	lastSubStatements: optional(array(lazy((): typeof SimpleStatementSchema => SimpleStatementSchema))),
});

export type SimpleStatement = InferOutput<typeof SimpleStatementSchema>;

export function statementToSimpleStatement(
	statement: Statement
): SimpleStatement {
	const simple: SimpleStatement = {
		statementId: statement.statementId,
		statement: statement.statement,
		statementType: statement.statementType,
		paragraphs: statement.paragraphs ?? [],
		creatorId: statement.creatorId,
		creator: statement.creator,
		parentId: statement.parentId,
		// Use evaluation.agreement when available, fallback to consensus for legacy data
		consensus: statement.evaluation?.agreement ?? statement.consensus ?? 0,
		voted: statement.voted ?? 0,
		lastUpdate: statement.lastUpdate ?? 0,
		createdAt: statement.createdAt ?? 0
	};

	if (statement.imagesURL?.main) simple.imageURL = statement.imagesURL?.main;

	return simple;
}
