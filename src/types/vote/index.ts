import { object, string, number, optional, InferOutput } from 'valibot';
import { CreatorSchema } from '../user/User';

export const VoteSchema = object({
	voteId: string(),
	statementId: string(),
	userId: string(),
	parentId: string(),
	lastUpdate: number(),
	createdAt: number(),
	voter: optional(CreatorSchema),
});

export type Vote = InferOutput<typeof VoteSchema>;

export function getVoteId(userId: string, parentId: string) {
	return `${userId}--${parentId}`;
}
