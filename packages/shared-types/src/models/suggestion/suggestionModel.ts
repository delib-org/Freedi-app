import { object, string, boolean, number, optional, array, InferOutput } from 'valibot';

export const SuggestionSchema = object({
	suggestionId: string(),
	paragraphId: string(),
	documentId: string(),
	topParentId: string(),
	originalContent: string(),
	suggestedContent: string(),
	reasoning: optional(string()),
	creatorId: string(),
	creatorDisplayName: string(),
	createdAt: number(),
	lastUpdate: number(),
	consensus: number(),
	hide: boolean(),
	// Evaluation counts for displaying vote breakdown
	positiveEvaluations: optional(number()),
	negativeEvaluations: optional(number()),
	// AI-generated suggestion fields
	isAIGenerated: optional(boolean()),
	aiSourceSuggestionIds: optional(array(string())),
	aiModel: optional(string()),
	aiGeneratedAt: optional(number()),
	// Late addition marker (added during refinement phase)
	isLateAddition: optional(boolean()),
});

export type Suggestion = InferOutput<typeof SuggestionSchema>;

/**
 * Schema for tracking typing status in real-time
 * Stored in 'typingStatus' collection with document ID: `${paragraphId}--${userId}`
 */
export const TypingStatusSchema = object({
	paragraphId: string(),
	userId: string(),
	displayName: optional(string()),
	isTyping: boolean(),
	lastUpdate: number(),
});

export type TypingStatus = InferOutput<typeof TypingStatusSchema>;
