import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';
import { logError } from '../utils/errorHandling';

/**
 * Paraphrase expansion for the interactive find-similar flow
 * (docs/architecture/CLAIM_REGISTRY.md §8).
 *
 * A single embedding of the user's input can miss same-meaning suggestions
 * written with different vocabulary. Embedding 2–3 LLM paraphrases and taking
 * the max similarity per candidate widens the net cheaply — the submission
 * flow is latency-sensitive, so it gets this instead of a full claim-registry
 * classification call.
 */

const PARAPHRASE_SYSTEM = `You rewrite a user's suggestion in different words for a semantic search. Produce paraphrases that keep the EXACT meaning but use different vocabulary and sentence structure. Same language as the input.

Respond with JSON only: {"paraphrases": ["...", "..."]}`;

/** Fails open: returns [] so callers proceed with the original text only. */
export async function generateParaphrases(
	text: string,
	questionText: string,
	count: number,
): Promise<string[]> {
	if (!text.trim() || count <= 0) return [];
	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system: PARAPHRASE_SYSTEM,
			user: `Question: "${questionText}"\n\nSuggestion: "${text}"\n\nWrite ${count} paraphrases. Respond with the JSON object.`,
			temperature: 0.4,
			maxTokens: 300,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(raw)) as { paraphrases?: unknown };
		if (!Array.isArray(parsed.paraphrases)) return [];

		return parsed.paraphrases
			.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
			.slice(0, count);
	} catch (error) {
		logError(error, {
			operation: 'paraphraseService.generateParaphrases',
			metadata: { textLength: text.length },
		});

		return [];
	}
}
