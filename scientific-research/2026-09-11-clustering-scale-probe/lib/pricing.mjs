// Token bounds and cost formulas. Prices come from study.json (official
// schedule, retrieval date recorded there); nothing is hardcoded here.
import { utf8Bytes } from './util.mjs';

/**
 * Conservative input bound without a tokenizer: one token per 2 UTF-8 bytes,
 * plus per-message and schema overhead. English BPE averages ~4 bytes/token,
 * so this over-reserves roughly 2×; smoke usage checks it (dry-run records
 * bound vs observed).
 */
export function chatInputBound(body) {
	const msgBytes = body.messages.reduce((a, m) => a + utf8Bytes(m.content) + 64, 0);
	const schemaBytes = body.response_format ? utf8Bytes(JSON.stringify(body.response_format)) : 0;

	return Math.ceil((msgBytes + schemaBytes) / 2) + 32;
}

export const embeddingInputBound = (texts) => texts.reduce((a, t) => a + Math.ceil(utf8Bytes(t) / 2) + 4, 0);

function tier(price, inputTokens) {
	const long = price.longContextThreshold != null && inputTokens > price.longContextThreshold;

	return {
		long,
		inRate: price.inputPerM * (long ? price.longContextInputMultiplier : 1),
		cachedRate: (price.cachedInputPerM ?? price.inputPerM) * (long ? price.longContextInputMultiplier : 1),
		outRate: (price.outputPerM ?? 0) * (long ? price.longContextOutputMultiplier : 1),
	};
}

/** Worst case: every input token billed as a cache write, full output cap used. */
export function worstCaseChatUsd(inputBound, maxOutputTokens, price) {
	const t = tier(price, inputBound);

	return (inputBound * t.inRate * (price.cacheWriteMultiplier ?? 1) + maxOutputTokens * t.outRate) / 1e6;
}

/**
 * Actual cost from an OpenAI chat usage object. cached_tokens and
 * cache_write_tokens are subsets of prompt_tokens (verified in the 2026-09-04
 * baseline raw usage: write 1596 of prompt 1599). Reasoning tokens are inside
 * completion_tokens, so they are not added again. Returns null when the usage
 * cannot be resolved — the caller must then keep the full reservation.
 */
export function actualChatUsd(usage, price) {
	const P = usage?.prompt_tokens;
	const C = usage?.completion_tokens;
	if (!Number.isFinite(P) || !Number.isFinite(C)) return null;
	const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
	const write = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
	const t = tier(price, P);
	const cw = price.cacheWriteMultiplier ?? 1;
	const anomaly = cached + write > P;
	const billed = anomaly
		? (P * t.inRate * cw + C * t.outRate) / 1e6
		: ((P - cached - write) * t.inRate + write * t.inRate * cw + cached * t.cachedRate + C * t.outRate) / 1e6;

	return {
		billedUsd: billed,
		undiscountedUsd: (P * t.inRate + C * t.outRate) / 1e6,
		longContext: t.long,
		anomaly,
		tokens: {
			prompt: P,
			cached,
			cacheWrite: write,
			uncached: P - cached,
			completion: C,
			reasoning: usage.completion_tokens_details?.reasoning_tokens ?? null,
		},
	};
}

export function actualEmbeddingUsd(usage, price) {
	const P = usage?.prompt_tokens ?? usage?.total_tokens;
	if (!Number.isFinite(P)) return null;

	return { billedUsd: (P * price.inputPerM) / 1e6, undiscountedUsd: (P * price.inputPerM) / 1e6, tokens: { prompt: P } };
}

export const worstCaseEmbeddingUsd = (bound, price) => (bound * price.inputPerM) / 1e6;
