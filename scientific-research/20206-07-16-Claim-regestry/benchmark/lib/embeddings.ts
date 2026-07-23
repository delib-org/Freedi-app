/** Text-keyed embedding cache so clustering experiments don't re-pay for the same vectors. */
import { getOpenAI } from '../../../../functions/src/config/openai-chat';
import { readJsonl, appendJsonl } from './io';

const EMBEDDING_MODEL = 'text-embedding-3-small';

interface EmbeddingRow {
	text: string;
	vector: number[];
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
	const openai = getOpenAI();
	const out: number[][] = [];
	for (let i = 0; i < inputs.length; i += 100) {
		const response = await openai.embeddings.create({
			model: EMBEDDING_MODEL,
			input: inputs.slice(i, i + 100),
		});
		out.push(...response.data.map((d) => d.embedding));
	}

	return out;
}

/** Same as embedBatch, but persists {text, vector} rows in `cacheFile` and skips re-fetching known text. */
export async function cachedEmbedBatch(inputs: string[], cacheFile: string): Promise<number[][]> {
	const cache = new Map<string, number[]>();
	for (const row of readJsonl<EmbeddingRow>(cacheFile)) cache.set(row.text, row.vector);

	const missing = [...new Set(inputs)].filter((text) => !cache.has(text));
	if (missing.length > 0) {
		const vectors = await embedBatch(missing);
		missing.forEach((text, i) => {
			cache.set(text, vectors[i]);
			appendJsonl(cacheFile, { text, vector: vectors[i] } satisfies EmbeddingRow);
		});
	}

	return inputs.map((text) => cache.get(text)!);
}
