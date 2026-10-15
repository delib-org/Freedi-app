import { HttpsError } from 'firebase-functions/v2/https';
import { AGORA_LIBRARY_LANGS, AgoraLibraryLang } from '@freedi/shared-types';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';
import { logError } from '../utils/errorHandling';

/**
 * AI translation for the scenario library, on the project's existing OpenAI
 * helper (`callLLM` + the gpt-5.6 worker model) — no new provider.
 *
 * Everything here is cached by its caller (one translation doc per scenario
 * per language; labels on the tag doc), so each string is paid for once.
 */

const LANGUAGE_NAMES: Record<AgoraLibraryLang, string> = {
	he: 'Hebrew',
	en: 'English',
	ar: 'Arabic',
	es: 'Spanish',
	de: 'German',
	nl: 'Dutch',
};

/** Strings per model call: keeps one answer small enough to arrive whole */
const CHUNK_STRINGS = 60;
const CHUNK_CHARS = 9000;
const ANSWER_TOKENS = 6000;
const TRIES = 2;

export function languageNameOf(lang: string): string {
	return LANGUAGE_NAMES[lang as AgoraLibraryLang] ?? lang;
}

/** Split `strings` into runs a single call can carry; indexes refer to the input array */
export function chunkStrings(strings: readonly string[]): number[][] {
	const chunks: number[][] = [];
	let current: number[] = [];
	let chars = 0;
	strings.forEach((text, index) => {
		if (
			current.length > 0 &&
			(current.length >= CHUNK_STRINGS || chars + text.length > CHUNK_CHARS)
		) {
			chunks.push(current);
			current = [];
			chars = 0;
		}
		current.push(index);
		chars += text.length;
	});
	if (current.length > 0) chunks.push(current);

	return chunks;
}

async function translateChunk(texts: string[], from: string, to: string): Promise<string[]> {
	const system =
		`You translate text for a classroom civics game used by teachers. ` +
		`Translate every item of the JSON array from ${languageNameOf(from)} into ${languageNameOf(to)}. ` +
		`Keep the meaning, tone and reading level (the readers are teenagers). Keep proper names of people ` +
		`and places unless they have a common ${languageNameOf(to)} form. Keep line breaks, numbering and punctuation style. ` +
		`Do not explain, add, merge, split or drop items. ` +
		`Return JSON only: {"t": [...]} with exactly the same number of items, in the same order.`;
	let lastProblem = 'no answer';
	for (let attempt = 1; attempt <= TRIES; attempt++) {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system,
			user: JSON.stringify({ t: texts }),
			maxTokens: ANSWER_TOKENS,
			temperature: 0.2,
			jsonMode: true,
			reasoningEffort: 'none',
		});
		try {
			const parsed = JSON.parse(extractJson(raw)) as { t?: unknown };
			if (
				Array.isArray(parsed.t) &&
				parsed.t.length === texts.length &&
				parsed.t.every((item) => typeof item === 'string')
			) {
				return parsed.t as string[];
			}
			lastProblem = `expected ${texts.length} strings`;
		} catch {
			lastProblem = 'answer was not JSON';
		}
	}
	throw new Error(`Translation came back unusable: ${lastProblem}`);
}

/**
 * Translate `strings` (blank ones are passed through untouched). Chunks run in
 * parallel; a chunk the model cannot answer faithfully fails the whole call
 * rather than returning a half-translated scenario.
 */
export async function translateStrings(
	strings: readonly string[],
	from: string,
	to: string,
): Promise<string[]> {
	if (!process.env.OPENAI_API_KEY) {
		throw new HttpsError('failed-precondition', 'AI translation is not configured');
	}
	const out = [...strings];
	const filled = strings
		.map((text, index) => ({ text, index }))
		.filter((entry) => entry.text.trim().length > 0);
	const chunks = chunkStrings(filled.map((entry) => entry.text));
	await Promise.all(
		chunks.map(async (chunk) => {
			const entries = chunk.map((position) => filled[position]);
			const answered = await translateChunk(
				entries.map((entry) => entry.text),
				from,
				to,
			);
			entries.forEach((entry, position) => {
				out[entry.index] = answered[position];
			});
		}),
	);

	return out;
}

/**
 * A tag's label in every library language, in one call. When the model is
 * unavailable the tag is still created — with the author's words alone, which
 * every reader falls back to — so a teacher is never stopped by the translator.
 */
export async function translateLabel(label: string, from: string): Promise<Record<string, string>> {
	const labels: Record<string, string> = { [from]: label };
	if (!process.env.OPENAI_API_KEY) return labels;
	const targets = AGORA_LIBRARY_LANGS.filter((lang) => lang !== from);
	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system:
				`Translate a short school-subject or lesson-type name from ${languageNameOf(from)} into each requested language. ` +
				`Use the natural term teachers use there (2-5 words). Return JSON only: an object mapping language code to translation.`,
			user: JSON.stringify({ name: label, languages: targets }),
			maxTokens: 600,
			temperature: 0.2,
			jsonMode: true,
			reasoningEffort: 'none',
		});
		const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
		for (const lang of targets) {
			const value = parsed[lang];
			if (typeof value === 'string' && value.trim()) labels[lang] = value.trim().slice(0, 80);
		}
	} catch (error) {
		logError(error, { operation: 'agora.library.translateLabel', metadata: { from } });
	}

	return labels;
}
