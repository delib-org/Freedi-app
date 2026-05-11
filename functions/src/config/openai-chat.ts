import OpenAI from 'openai';
import pLimit from 'p-limit';
import { logger } from 'firebase-functions';

// Centralized model names — update here when OpenAI releases new versions.
// Defaults chosen May 2026:
//   - gpt-4o for taxonomy (one call per parent, capability matters)
//   - gpt-4o-mini for normalization + naming (high volume, cheap + fast)
export const TAXONOMY_MODEL = process.env.OPENAI_TAXONOMY_MODEL || 'gpt-4o';
export const WORKER_MODEL = process.env.OPENAI_WORKER_MODEL || 'gpt-4o-mini';

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
	if (_client) return _client;
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in .env');
	}
	_client = new OpenAI({ apiKey });

	return _client;
}

const limiter = pLimit(Number(process.env.LLM_CONCURRENCY ?? DEFAULT_CONCURRENCY));

interface CallOptions {
	model: string;
	system?: string;
	user: string;
	maxTokens?: number;
	temperature?: number;
	jsonMode?: boolean;
}

function isRetryableError(error: unknown): boolean {
	const e = error as { status?: number };
	if (!e) return false;
	if (e.status === 429) return true;
	if (e.status !== undefined && e.status >= 500 && e.status < 600) return true;

	return false;
}

/**
 * Single OpenAI Chat Completion call. Returns the assistant's text content.
 * Concurrency-limited (env LLM_CONCURRENCY, default 10).
 * Retries up to 3 times with exponential backoff on 429/5xx.
 */
export async function callLLM(opts: CallOptions): Promise<string> {
	return limiter(async () => {
		const client = getOpenAI();
		let lastError: unknown;

		for (let attempt = 1; attempt <= DEFAULT_RETRIES; attempt++) {
			try {
				const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
				if (opts.system) messages.push({ role: 'system', content: opts.system });
				messages.push({ role: 'user', content: opts.user });

				const response = await client.chat.completions.create({
					model: opts.model,
					messages,
					max_tokens: opts.maxTokens ?? 1024,
					temperature: opts.temperature ?? 0,
					...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
				});
				const text = response.choices[0]?.message?.content;
				if (typeof text !== 'string') {
					throw new Error('OpenAI returned an empty completion');
				}

				return text;
			} catch (error) {
				lastError = error;
				if (!isRetryableError(error) || attempt === DEFAULT_RETRIES) break;
				const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
				logger.warn(`OpenAI call retry ${attempt}/${DEFAULT_RETRIES} after ${delay}ms`, {
					model: opts.model,
					error: (error as Error).message,
				});
				await new Promise((r) => setTimeout(r, delay));
			}
		}
		throw lastError;
	});
}

/**
 * Strip markdown code fences and try to extract a JSON object/array from the
 * response text. Used by callers that need structured output.
 */
export function extractJson(text: string): string {
	let s = text.trim();
	s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
	const objMatch = s.match(/\{[\s\S]*\}/);
	const arrMatch = s.match(/\[[\s\S]*\]/);
	if (objMatch && (!arrMatch || objMatch.index! < arrMatch.index!)) return objMatch[0];
	if (arrMatch) return arrMatch[0];

	return s;
}
