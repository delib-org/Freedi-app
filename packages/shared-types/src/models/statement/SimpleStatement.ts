import { array, BaseSchema, enum_, InferOutput, lazy, number, object, optional, string } from 'valibot';
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
