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
	/**
	 * join-class: the teacher who cast this vote for a student without a device.
	 * Server-written only (classCastVoteFor; the rules refuse it from any client).
	 */
	enteredByUid: optional(string()),
});

export type Vote = InferOutput<typeof VoteSchema>;

export function getVoteId(userId: string, parentId: string) {
	return `${userId}--${parentId}`;
}

export const VotingSettingsSchema = object({
	showPercentages: optional(boolean()),
	showHighetRelativeToViewedOptions: optional(boolean()),
	/** join-class: the gate a proposal's consensus must pass (default DEFAULT_GATE = 0.6). */
	threshold: optional(number()),
});

export type VotingSettings = InferOutput<typeof VotingSettingsSchema>;