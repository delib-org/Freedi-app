import { getGeminiModel } from '../config/gemini';
import { logError } from '../utils/errorHandling';

/**
 * Four-way verdict on whether two proposals are semantically equivalent.
 *
 * - same     — paraphrases or near-duplicates of the same proposal
 * - related  — same topic, different stance / recommendation / magnitude
 * - different — embeddings happened to be close; proposals are unrelated
 * - opposite — explicit contradictions of the same proposition
 *
 * See docs/papers/idea-synthesis-paper.md §2.6 for category definitions.
 */
export type EquivalenceVerdict = 'same' | 'related' | 'different' | 'opposite';

export interface EquivalencePair {
	pairId: string;
	textA: string;
	textB: string;
}

export interface EquivalenceResult {
	pairId: string;
	verdict: EquivalenceVerdict;
	reason: string;
}

const MAX_PAIRS_PER_CALL = 20;
const VALID_VERDICTS: ReadonlySet<EquivalenceVerdict> = new Set([
	'same',
	'related',
	'different',
	'opposite',
]);

const PROMPT_HEADER = `You will receive pairs of proposals (A, B) from the same deliberation question.
For each pair, decide which ONE of these four verdicts best applies:

  same     — A and B are paraphrases of essentially the same proposal.
             Their authors would probably agree they meant the same thing.
  related  — A and B are about the same topic but propose different actions,
             stances, or magnitudes (e.g. "raise X" vs "lower X" magnitudes,
             or different priorities on the same subject).
  different — A and B are about different things; their wording is similar
              by coincidence.
  opposite  — A and B propose contradictory actions on the same subject
              (e.g. "ban X" vs "permit X").

Use "same" ONLY when the two proposals are essentially interchangeable.
When in doubt between "same" and "related", prefer "related".

Return ONLY a JSON array with no markdown formatting:
[{"pairIndex": 1, "verdict": "same|related|different|opposite", "reason": "brief explanation"}, ...]

Include EVERY pair in the response.`;

/**
 * Run four-way semantic-equivalence judgment over a list of pairs.
 *
 * Pairs are batched at 20 per Gemini call. Caller is responsible for any
 * cosine-similarity pre-filtering — this service judges whatever it receives.
 *
 * On per-batch failure, that batch's pairs receive verdict "different" with
 * an error reason, so partial failure does not poison the merge decision
 * (defaulting to "different" is conservative — it drops the candidate edge).
 */
export async function judgeSemanticEquivalence(
	pairs: EquivalencePair[],
): Promise<EquivalenceResult[]> {
	if (pairs.length === 0) return [];

	const batches: EquivalencePair[][] = [];
	for (let i = 0; i < pairs.length; i += MAX_PAIRS_PER_CALL) {
		batches.push(pairs.slice(i, i + MAX_PAIRS_PER_CALL));
	}

	const results: EquivalenceResult[] = [];
	for (const batch of batches) {
		const batchResults = await judgeBatch(batch);
		results.push(...batchResults);
	}

	return results;
}

async function judgeBatch(batch: EquivalencePair[]): Promise<EquivalenceResult[]> {
	try {
		const model = getGeminiModel();
		const pairsText = batch
			.map((p, idx) => `${idx + 1}. A: "${p.textA}"\n   B: "${p.textB}"`)
			.join('\n\n');

		const prompt = `${PROMPT_HEADER}\n\nPairs:\n${pairsText}`;

		const response = await model.generateContent(prompt);
		const text = response.response.text();

		const parsed = parseVerdictJson(text);

		const results: EquivalenceResult[] = [];
		const seen = new Set<number>();

		for (const item of parsed) {
			const idx = item.pairIndex - 1;
			if (idx < 0 || idx >= batch.length) continue;
			if (seen.has(idx)) continue;
			seen.add(idx);
			const verdict = normalizeVerdict(item.verdict);
			results.push({
				pairId: batch[idx].pairId,
				verdict,
				reason: typeof item.reason === 'string' ? item.reason : '',
			});
		}

		// Any pairs the model failed to return get a conservative "different"
		// verdict so a parsing miss does not silently merge candidates.
		for (let idx = 0; idx < batch.length; idx++) {
			if (!seen.has(idx)) {
				results.push({
					pairId: batch[idx].pairId,
					verdict: 'different',
					reason: 'No verdict returned by model',
				});
			}
		}

		return results;
	} catch (error) {
		logError(error, {
			operation: 'semanticEquivalence.judgeBatch',
			metadata: { pairCount: batch.length },
		});

		return batch.map((p) => ({
			pairId: p.pairId,
			verdict: 'different' as EquivalenceVerdict,
			reason: 'LLM call failed; defaulting to different',
		}));
	}
}

interface RawVerdictItem {
	pairIndex: number;
	verdict: string;
	reason?: string;
}

function parseVerdictJson(text: string): RawVerdictItem[] {
	let cleaned = text
		.replace(/```json\s*/g, '')
		.replace(/```\s*/g, '')
		.trim();
	const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
	if (arrayMatch) {
		cleaned = arrayMatch[0];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		// Unparseable response → caller falls back to "different" for every pair
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	const items: RawVerdictItem[] = [];
	for (const entry of parsed) {
		if (
			entry &&
			typeof entry === 'object' &&
			typeof (entry as Record<string, unknown>).pairIndex === 'number' &&
			typeof (entry as Record<string, unknown>).verdict === 'string'
		) {
			const obj = entry as Record<string, unknown>;
			items.push({
				pairIndex: obj.pairIndex as number,
				verdict: obj.verdict as string,
				reason: typeof obj.reason === 'string' ? (obj.reason as string) : undefined,
			});
		}
	}

	return items;
}

function normalizeVerdict(raw: string): EquivalenceVerdict {
	const lowered = raw.trim().toLowerCase();
	if (VALID_VERDICTS.has(lowered as EquivalenceVerdict)) {
		return lowered as EquivalenceVerdict;
	}

	// Permissive synonym mapping for model drift
	if (lowered === 'duplicate' || lowered === 'paraphrase' || lowered === 'equivalent') {
		return 'same';
	}
	if (lowered === 'contradiction' || lowered === 'contradictory' || lowered === 'opposed') {
		return 'opposite';
	}
	if (lowered === 'similar' || lowered === 'topical') {
		return 'related';
	}

	return 'different';
}
