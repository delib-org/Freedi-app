import { MIN_TEXT_CHARS, MIN_TEXT_WORDS_CJK, NOISE_POOL_MIN_COUNT } from './constants';
import type { PooledResponses, RawResponse } from './types';

const CJK_LANGUAGES = new Set(['zh', 'ja', 'ko']);

function isTooShort(r: RawResponse): boolean {
	if (CJK_LANGUAGES.has(r.language)) {
		const wordCount = r.text.trim().split(/\s+/).filter(Boolean).length;

		return wordCount < MIN_TEXT_WORDS_CJK;
	}

	return r.text.length < MIN_TEXT_CHARS;
}

/**
 * Split responses into three buckets per the spec:
 * - core: clusterable input
 * - short: reattached to nearest cluster after clustering (cosine > 0.5)
 * - noise: same reattach rule, but only quarantined if there are many of them
 */
export function splitPools(responses: RawResponse[]): PooledResponses {
	// First pass: collect short statements.
	const short: RawResponse[] = [];
	const remaining: RawResponse[] = [];
	for (const r of responses) {
		if (isTooShort(r)) short.push(r);
		else remaining.push(r);
	}

	// Second pass: only quarantine zero-evaluator responses if there are >50 of them.
	// Otherwise they stay in core. (Per spec: skip noise pool for small datasets.)
	const zeroEval = remaining.filter((r) => r.totalEvaluators === 0);
	if (zeroEval.length > NOISE_POOL_MIN_COUNT) {
		const zeroEvalIds = new Set(zeroEval.map((r) => r.statementId));
		const core = remaining.filter((r) => !zeroEvalIds.has(r.statementId));

		return { core, short, noise: zeroEval };
	}

	return { core: remaining, short, noise: [] };
}
