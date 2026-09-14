// The ONLY module that reads an API key. It is dynamic-imported by the
// `smoke` and `run` commands; importing it has no side effects (the key is
// read when createOpenAITransport() is called, never at module load).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadApiKey(repoRoot) {
	if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
	const text = readFileSync(join(repoRoot, 'functions', '.env'), 'utf8');
	const line = text.split('\n').find((l) => l.startsWith('OPENAI_API_KEY='));
	if (!line) throw new Error('OPENAI_API_KEY not found in environment or functions/.env');
	let value = line.slice('OPENAI_API_KEY='.length).trim();
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);

	return value;
}

function retryAfterMs(headers) {
	const ms = headers.get('retry-after-ms');
	if (ms && Number.isFinite(Number(ms))) return Number(ms);
	const s = headers.get('retry-after');
	if (s && Number.isFinite(Number(s))) return Number(s) * 1000;

	return null;
}

/**
 * Returns {chat, embed}. Each resolves to either
 *   {kind:'response', status, json, bodyText, requestId, retryAfterMs, elapsedMs}
 * or {kind:'timeout'|'network', error, elapsedMs}. Never throws, never retries —
 * retry and budget policy live in the executor.
 */
export function createOpenAITransport({ repoRoot, fetchImpl = globalThis.fetch, baseUrl = 'https://api.openai.com/v1' }) {
	const apiKey = loadApiKey(repoRoot);

	async function post(path, body, timeoutMs) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		const started = performance.now();
		try {
			const res = await fetchImpl(`${baseUrl}/${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
				body: JSON.stringify(body),
				signal: ctrl.signal,
			});
			const bodyText = await res.text();
			let json = null;
			try {
				json = JSON.parse(bodyText);
			} catch {
				json = null;
			}

			return {
				kind: 'response',
				status: res.status,
				json,
				bodyText: json ? null : bodyText.slice(0, 500),
				requestId: res.headers.get('x-request-id'),
				retryAfterMs: retryAfterMs(res.headers),
				elapsedMs: performance.now() - started,
			};
		} catch (error) {
			return {
				kind: error?.name === 'AbortError' ? 'timeout' : 'network',
				error: String(error?.message ?? error).slice(0, 300),
				elapsedMs: performance.now() - started,
			};
		} finally {
			clearTimeout(timer);
		}
	}

	return {
		chat: (body, { timeoutMs }) => post('chat/completions', body, timeoutMs),
		embed: (body, { timeoutMs }) => post('embeddings', body, timeoutMs),
	};
}
