import { logger } from 'firebase-functions';
import { callLLM, WORKER_MODEL, extractJson } from '../config/openai-chat';

/**
 * Brief-text distillation for embeddings.
 *
 * IMPORTANT: this NEVER changes the original option text. It produces a separate
 * short "brief" that is used only as the input to the embedding model (and is
 * stored alongside the vector as `embeddingBrief` for debugging). The canonical
 * `statement` text is untouched.
 *
 * Why: deliberation options are flowery vision paragraphs sharing heavy
 * boilerplate ("the vision is to see X as a community that…"), so embedding the
 * FULL text makes everything look ~0.75 similar — collapsing a question into one
 * blob and hiding genuine near-duplicate pairs. Embedding a short brief — the
 * core action/topic with the framing stripped — sharpens the geometry so
 * clustering separates real themes.
 *
 * Fail-open: any error (or text already short) returns the original text, so
 * embedding generation never breaks because of the brief step.
 */

/** Texts shorter than this are already brief-like; skip the LLM call. */
const MIN_LENGTH_FOR_BRIEF = 40;

/**
 * Whether to embed the distilled brief instead of the full text. Gated by env so
 * it can be flipped off instantly without a code change. Defaults ON.
 */
export function briefEmbeddingsEnabled(): boolean {
	return (process.env.EMBEDDING_USE_BRIEF ?? 'true').toLowerCase() !== 'false';
}

/**
 * Distill an option to a short brief (5–15 words) for embedding. Returns the
 * original text unchanged on any failure or when the text is already short.
 * Does NOT persist anything or alter the source statement.
 */
export async function generateBrief(text: string, context?: string): Promise<string> {
	const trimmed = (text ?? '').trim();
	if (trimmed.length < MIN_LENGTH_FOR_BRIEF) return trimmed;

	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system:
				'You distill a community proposal down to its core idea so similar ideas ' +
				'cluster together. Strip vision framing, rhetoric, and boilerplate; keep only ' +
				'the distinctive action or topic. Reply in the SAME language as the input.',
			user: `QUESTION CONTEXT: ${context ?? ''}\n\nPROPOSAL: ${trimmed}\n\nReturn JSON: {"brief": "<5-15 word core idea, same language as the proposal>"}`,
			maxTokens: 100,
			temperature: 0,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(raw)) as { brief?: unknown };
		const brief = typeof parsed.brief === 'string' ? parsed.brief.trim() : '';

		return brief || trimmed;
	} catch (error) {
		logger.warn('generateBrief: failed, falling back to full text', {
			error: error instanceof Error ? error.message : String(error),
		});

		return trimmed;
	}
}
