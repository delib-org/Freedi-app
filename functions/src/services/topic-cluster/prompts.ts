// Versioned prompts for the topic-cluster pipeline. Bumping the version (in
// constants.ts) invalidates corresponding cache entries automatically.

import type { TaxonomyCategory } from '@freedi/shared-types';

// ----------------------------- Step 2: taxonomy -----------------------------

export const TAXONOMY_SYSTEM = `You are a careful research assistant that classifies free-text responses to a question.

You will receive an open-ended QUESTION and a sample of RESPONSES. Propose a taxonomy of categories that organizes the responses by WHAT THEY PROPOSE OR ASSERT — not by sentiment, not by length, not by who wrote them.

Constraints:
- Return between 1 and 8 categories. Prefer fewer broader categories over many narrow ones.
- If the responses are mostly paraphrases of the same idea (homogeneous corpus), return a SINGLE category that captures that shared idea. Do not invent distinctions that aren't in the data.
- A response that doesn't fit any broader theme is an OUTLIER. Give it its own narrow category that describes only that response. NEVER lump unrelated outliers together — "dogs in the park" and "parking traffic study" do not belong in the same category even if both are minority opinions.
- Each "name" must be unique across the returned categories. If two ideas would have the same display name, merge them into one category.
- Category display names must be in the dominant language of the responses. If responses are mixed, use English. Never mix two languages within a single category name.
- The "key" field must be short snake_case English (e.g. "shared_infrastructure"), stable across reruns.
- Each category needs a one-line description.

Output JSON only, no surrounding prose, no markdown fences.`;

export function taxonomyUserPrompt(question: string, responses: string[]): string {
	const numbered = responses.map((r, i) => `${i + 1}. ${r.replace(/\s+/g, ' ').trim()}`).join('\n');

	return `QUESTION:
${question}

SAMPLE OF RESPONSES (${responses.length}):
${numbered}

Return a JSON object with this exact shape:
{
  "language": "<ISO 639-1 code of dominant response language>",
  "categories": [
    { "key": "<snake_case_english>", "name": "<display name in dominant language>", "description": "<one line>" }
  ]
}`;
}

// --------------------------- Step 3: normalization --------------------------

export const NORMALIZE_SYSTEM = `You are a research assistant. You receive an open-ended QUESTION, a fixed TAXONOMY of categories, and one or more RESPONSES. For each response, extract the underlying action(s) or answer(s) it makes.

Rules:
- canonical_sentence: ONE short sentence in the same language as the response. Strip preambles ("I think that...", "It is important that..."), framing, and references to the question. Use imperative form for action proposals, declarative for value/preference statements.
- category_key: pick exactly one key from the taxonomy below. Use "other" only if truly nothing fits.
- If a response makes multiple distinct actions/answers, return them as separate array elements. Otherwise return a single-element array.
- Output JSON only, no markdown, no prose.`;

export function normalizeUserPrompt(
	question: string,
	taxonomy: TaxonomyCategory[],
	responses: Array<{ id: string; text: string }>,
): string {
	const taxonomyJson = JSON.stringify(
		taxonomy.map((c) => ({ key: c.key, description: c.description })),
		null,
		0,
	);
	const responsesBlock = responses
		.map((r, i) => `Response ${i + 1} (id ${r.id}):\n${r.text.replace(/\s+/g, ' ').trim()}`)
		.join('\n\n');

	return `QUESTION:
${question}

TAXONOMY (use these keys):
${taxonomyJson}

RESPONSES TO NORMALIZE:
${responsesBlock}

Return JSON only:
{
  "responses": [
    {
      "id": "<response id from above>",
      "actions": [
        { "canonical_sentence": "<...>", "category_key": "<one of the taxonomy keys, or 'other'>" }
      ]
    }
  ]
}

The "responses" array must have exactly ${responses.length} entries, one per input response, in the same order.`;
}

// ----------------------------- Step 6: naming -------------------------------

export const NAME_SYSTEM = `You receive a small set of responses to a question, all on a related theme. Write a single label of 3 to 8 words that names the theme. The label MUST be in the same language as the responses. Output the label only — no quotes, no punctuation, no prefix like "Cluster:".`;

export function nameUserPrompt(question: string, samples: string[]): string {
	return `QUESTION: ${question}

RESPONSES:
${samples.map((s) => '- ' + s.replace(/\s+/g, ' ').trim()).join('\n')}

LABEL:`;
}
