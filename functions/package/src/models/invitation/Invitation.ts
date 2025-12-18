import { InferOutput, number, object, string } from 'valibot';

export const InvitationSchema = object({
	pathname: string(),
	statementId: string(),
	lastUpdate: number(),
	number: number(),
});

export type Invitation = InferOutput<typeof InvitationSchema>;
