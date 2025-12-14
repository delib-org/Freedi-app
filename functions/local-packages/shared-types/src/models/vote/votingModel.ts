import { object, string, number, optional, InferOutput, boolean } from 'valibot';
import { UserSchema } from '../user/User';

export const VoteSchema = object({
	voteId: string(),
	statementId: string(),
	userId: string(),
	parentId: string(),
	lastUpdate: number(),
	createdAt: number(),
	voter: optional(UserSchema),
});

export type Vote = InferOutput<typeof VoteSchema>;

export function getVoteId(userId: string, parentId: string) {
	return `${userId}--${parentId}`;
}

export const VotingSettingsSchema = object({
	showPercentages: optional(boolean()),
	showHighetRelativeToViewedOptions: optional(boolean()),
});

export type VotingSettings = InferOutput<typeof VotingSettingsSchema>;