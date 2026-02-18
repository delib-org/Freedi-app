import { InferOutput, object, string, number, array, picklist, optional, boolean } from 'valibot';

export enum IdeaRefinementStatus {
	draft = 'draft',
	inRefinement = 'in-refinement',
	readyForDiscussion = 'ready-for-discussion',
	rejected = 'rejected',
}

export const RefinementMessageSchema = object({
	messageId: string(),
	role: picklist(['user', 'ai-guide']),
	content: string(),
	timestamp: number(),
	messageType: picklist(['question', 'answer', 'clarification', 'suggestion']),
});

export type RefinementMessage = InferOutput<typeof RefinementMessageSchema>;

export const RefinementSessionSchema = object({
	sessionId: string(),
	statementId: string(),
	userId: string(),
	originalIdea: string(),
	refinedIdea: string(),
	status: picklist(['draft', 'in-refinement', 'ready-for-discussion', 'rejected']),
	conversationHistory: array(RefinementMessageSchema),
	vagueTerms: array(string()),
	testabilityCriteria: array(string()),
	createdAt: number(),
	lastUpdate: number(),
	completedAt: optional(number()),
});

export type RefinementSession = InferOutput<typeof RefinementSessionSchema>;

export const FalsifiabilityAnalysisSchema = object({
	isTestable: boolean(),
	vagueTerms: array(string()),
	suggestions: array(string()),
	confidence: number(), // 0-1
	reasoning: string(),
});

export type FalsifiabilityAnalysis = InferOutput<typeof FalsifiabilityAnalysisSchema>;

export const RefinementMetadataSchema = object({
	wasRefined: boolean(),
	originalIdea: string(),
	refinementSessionId: string(),
	testabilityCriteria: array(string()),
	refinedAt: number(),
});

export type RefinementMetadata = InferOutput<typeof RefinementMetadataSchema>;
