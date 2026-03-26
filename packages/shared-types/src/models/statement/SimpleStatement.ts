import { array, BaseSchema, enum_, InferOutput, lazy, nullable, number, object, optional, pipe, string, transform } from 'valibot';
import { UserSchema } from '../user/User';
import { StatementType } from '../TypeEnums';
import { ParagraphSchema } from '../paragraph/paragraphModel';

export const SimpleStatementSchema: BaseSchema<any, any, any> = object({
	statementId: string(),
	statement: string(),
	description: optional(string()),
	statementType: enum_(StatementType),
	paragraphs: optional(array(ParagraphSchema)),
	creatorId: string(),
	creator: UserSchema,
	parentId: string(),
	consensus: pipe(nullable(number()), transform((v) => v ?? 0)),
	lastUpdate: optional(number()),
	createdAt: optional(number()),
	imageURL: optional(string()),
	voted: optional(number()),
	lastSubStatements: optional(array(lazy((): typeof SimpleStatementSchema => SimpleStatementSchema))),
});

export type SimpleStatement = InferOutput<typeof SimpleStatementSchema>;
