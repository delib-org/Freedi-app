import { logger } from 'firebase-functions';
import { callLLM, WORKER_MODEL, extractJson } from '../config/openai-chat';

/**
 * Gist distillation for embeddings.
 *
 * Deliberation options are written as flowery vision paragraphs that share a lot
 * of boilerplate ("the vision is to see X as a community that…"). Embedding the
 * FULL text makes everything look ~0.75 similar, which collapses a question into
 * one undifferentiated blob and hides genuine near-duplicate pairs.
 *
 * Embedding a short distilled "gist" — the core action/topic with the framing
 * stripped — sharpens the geometry: similar ideas score higher, distinct ideas
 * lower, so clustering separates real themes instead of blobbing.
 *
 * Fail-open: any error (or text too short to be worth distilling) returns the
 * original text, so embedding generation never breaks because of the gist step.
 */

/** Texts shorter than this are already gist-like; skip the LLM call. */
const MIN_LENGTH_FOR_GIST = 40;

/**
 * Whether to embed the distilled gist instead of the full text. Gated by env so
 * it can be flipped off instantly without a code change. Defaults ON.
 */
export function gistEmbeddingsEnabled(): boolean {
	return (process.env.EMBEDDING_USE_GIST ?? 'true').toLowerCase() !== 'false';
}

/**
 * Distill an option to its core idea (5–15 words) for embedding. Returns the
 * original text unchanged on any failure or when the text is already short.
 */
export async function generateGist(text: string, context?: string): Promise<string> {
	const trimmed = (text ?? '').trim();
	if (trimmed.length < MIN_LENGTH_FOR_GIST) return trimmed;

	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system:
				'You distill a community proposal down to its core idea so similar ideas ' +
				'cluster together. Strip vision framing, rhetoric, and boilerplate; keep only ' +
				'the distinctive action or topic. Reply in the SAME language as the input.',
			user: `QUESTION CONTEXT: ${context ?? ''}\n\nPROPOSAL: ${trimmed}\n\nReturn JSON: {"gist": "<5-15 word core idea, same language as the proposal>"}`,
			maxTokens: 100,
			temperature: 0,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(raw)) as { gist?: unknown };
		const gist = typeof parsed.gist === 'string' ? parsed.gist.trim() : '';

		return gist || trimmed;
	} catch (error) {
		logger.warn('generateGist: failed, falling back to full text', {
			error: error instanceof Error ? error.message : String(error),
		});

		return trimmed;
	}
}
