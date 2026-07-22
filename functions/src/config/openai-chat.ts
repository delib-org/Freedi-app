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
// 429s get more attempts with much longer waits: a sustained tokens-per-minute
// ceiling (e.g. gpt-4o at 30k TPM) refills slowly, so the fast 5xx backoff
// exhausts all attempts inside ~2s and the caller fails closed. Waiting inside
// the limiter slot also throttles overall throughput, which is exactly what a
// saturated bucket needs.
const RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 20_000;

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

function isRateLimitError(error: unknown): boolean {
	return (error as { status?: number })?.status === 429;
}

function isRetryableError(error: unknown): boolean {
	const e = error as { status?: number };
	if (!e) return false;
	if (e.status === 429) return true;
	if (e.status !== undefined && e.status >= 500 && e.status < 600) return true;

	return false;
}

/**
 * The wait the server asked for on a 429, from the `retry-after-ms` /
 * `retry-after` response headers (the OpenAI SDK exposes them on APIError) or,
 * failing that, the "Please try again in 428ms" phrase in the error message.
 * Null when no hint is present. Exported for tests.
 */
export function parseRetryAfterMs(error: unknown): number | null {
	const e = error as { headers?: unknown; message?: string };
	const getHeader = (name: string): string | undefined => {
		const headers = e?.headers;
		if (!headers) return undefined;
		if (typeof (headers as Headers).get === 'function') {
			return (headers as Headers).get(name) ?? undefined;
		}

		return (headers as Record<string, string | undefined>)[name];
	};

	const ms = Number(getHeader('retry-after-ms'));
	if (Number.isFinite(ms) && ms > 0) return ms;
	const seconds = Number(getHeader('retry-after'));
	if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

	const hinted = e?.message?.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
	if (hinted) {
		const value = Number(hinted[1]);
		if (Number.isFinite(value) && value > 0) {
			return hinted[2].toLowerCase() === 'ms' ? value : value * 1000;
		}
	}

	return null;
}

/** Backoff before retry `attempt` (1-based): server hint when given, else exponential; jittered, capped. */
function retryDelayMs(error: unknown, attempt: number): number {
	if (isRateLimitError(error)) {
		const base = parseRetryAfterMs(error) ?? RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
		const jittered = base * (1 + Math.random() * 0.25);

		return Math.min(RATE_LIMIT_MAX_DELAY_MS, jittered);
	}

	return RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
}

/**
 * Single OpenAI Chat Completion call. Returns the assistant's text content.
 * Concurrency-limited (env LLM_CONCURRENCY, default 10).
 * Retries 5xx up to 3 times with fast exponential backoff; 429s get up to 6
 * attempts honoring the server's retry-after hint (jittered, capped at 20s).
 */
export async function callLLM(opts: CallOptions): Promise<string> {
	return limiter(async () => {
		const client = getOpenAI();
		let lastError: unknown;

		for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt++) {
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
				const maxAttempts = isRateLimitError(error) ? RATE_LIMIT_RETRIES : DEFAULT_RETRIES;
				if (!isRetryableError(error) || attempt >= maxAttempts) break;
				const delay = Math.round(retryDelayMs(error, attempt));
				logger.warn(`OpenAI call retry ${attempt}/${maxAttempts} after ${delay}ms`, {
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
