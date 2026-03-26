import { object, string, number, boolean, optional, type InferOutput } from "valibot";

export const ModerationLogSchema = object({
	/** Unique ID for this moderation event */
	moderationId: string(),
	/** The original text that was rejected */
	originalText: string(),
	/** AI-generated reason for the rejection */
	reason: string(),
	/** The category of the rejection (e.g., 'hate_speech', 'personal_attack', etc.) */
	category: string(),
	/** The user who submitted the content */
	userId: string(),
	/** Display name of the user (for admin convenience) */
	displayName: optional(string()),
	/** The statement/question ID this was submitted under */
	parentId: string(),
	/** The top-level statement ID (for admin queries) */
	topParentId: string(),
	/** Whether it was blocked by Google safety filters vs AI moderation */
	blockedBySafetyFilter: boolean(),
	/** Timestamp in milliseconds */
	createdAt: number(),
});

export type ModerationLog = InferOutput<typeof ModerationLogSchema>;

/** Categories that the AI can assign to rejected content */
export enum ModerationCategory {
	profanity = "profanity",
	hate_speech = "hate_speech",
	personal_attack = "personal_attack",
	sexual_content = "sexual_content",
	violence_threats = "violence_threats",
	spam = "spam",
	other = "other",
}
