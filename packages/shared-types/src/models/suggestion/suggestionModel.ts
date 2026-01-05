import { object, string, boolean, number, optional, InferOutput } from 'valibot';

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
});

export type Suggestion = InferOutput<typeof SuggestionSchema>;
