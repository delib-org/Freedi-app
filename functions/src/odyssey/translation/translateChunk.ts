import type { OdysseyTranslationLang } from '@freedi/shared-types';
import { TAXONOMY_MODEL, callLLM, extractJson } from '../../config/openai-chat';
import type { TranslationItem, TranslationVoice } from './translationSource';

/**
 * One model call: a JSON object of {path: Hebrew} in, the same keys with
 * the translation out. The keys are the contract — the model may not add,
 * drop or rename one, and an answer that is not a non-empty string under a
 * key it was given is treated as missing, never as a translation.
 */

/** Elders' counsel runs long; a batch above this is split, so one answer never exceeds the model's output budget. */
export const MAX_BATCH_CHARS = 6000;

const TRANSLATE_MODEL = process.env.OPENAI_ODYSSEY_TRANSLATE_MODEL || TAXONOMY_MODEL;

const TARGET: Record<OdysseyTranslationLang, { name: string; address: string }> = {
	en: {
		name: 'English',
		address: 'Address the player as a neutral "you"; no gendered forms.',
	},
	ar: {
		name: 'Modern Standard Arabic (الفصحى)',
		address:
			'Address the player in the plural or in a neutral form (صيغة الجمع أو صيغة محايدة), never a gendered singular. Keep Western (Latin) digits.',
	},
};

export function buildSystemPrompt(lang: OdysseyTranslationLang, voice?: TranslationVoice): string {
	const target = TARGET[lang];
	const lines = [
		`You translate the content of "Israeli Odyssey" (אודיסיאה ישראלית), a Hebrew civic pre-election voyage game in which players take positions on public questions, into ${target.name}.`,
		'You receive a JSON object whose values are Hebrew strings. Return ONLY a JSON object with EXACTLY the same keys, each value translated. Never add, drop, merge or rename a key.',
		'Translate faithfully: keep the meaning, register, tone and approximate length. Do not add content, explanations, opinions or hedges; do not soften or sharpen political positions.',
		`Civic, respectful and neutral language. ${target.address}`,
		'Keep emoji, numbers, punctuation, quotation marks and line breaks. Hebrew gender-slash forms (e.g. תומך/ת) become one neutral form.',
		'People, parties, places and institutions take their standard name in the target language.',
		'Keys ending in /chips/N are short inspiration words: keep each to one to three words.',
	];
	if (voice) {
		lines.push(
			`Every value in this request is spoken in the first person by ${voice.name} — ${voice.role}. ${voice.bio} Keep that person's voice, era and cadence; translate, do not paraphrase or modernize.`,
		);
	}

	return lines.join('\n');
}

/** Split items into batches under the character budget, in order. */
export function batchItems(
	items: TranslationItem[],
	maxChars = MAX_BATCH_CHARS,
): TranslationItem[][] {
	const batches: TranslationItem[][] = [];
	let current: TranslationItem[] = [];
	let size = 0;
	for (const entry of items) {
		if (current.length > 0 && size + entry.text.length > maxChars) {
			batches.push(current);
			current = [];
			size = 0;
		}
		current.push(entry);
		size += entry.text.length;
	}
	if (current.length > 0) batches.push(current);

	return batches;
}

/** Answer budget: roughly the source length plus the repeated keys. */
function answerTokens(items: TranslationItem[]): number {
	const chars = items.reduce((sum, entry) => sum + entry.text.length + entry.path.length, 0);

	return Math.ceil(chars * 1.2) + 256;
}

/** The accepted translations of one batch, keyed by path; silently missing where the model failed a key. */
export function acceptAnswers(items: TranslationItem[], raw: string): Record<string, string> {
	const parsed = JSON.parse(extractJson(raw)) as unknown;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Translation answer is not a JSON object');
	}
	const answers = parsed as Record<string, unknown>;
	const accepted: Record<string, string> = {};
	for (const entry of items) {
		const value = answers[entry.path];
		if (typeof value === 'string' && value.trim() !== '') accepted[entry.path] = value.trim();
	}

	return accepted;
}

export async function translateBatch(
	lang: OdysseyTranslationLang,
	items: TranslationItem[],
	voice?: TranslationVoice,
): Promise<Record<string, string>> {
	const source = Object.fromEntries(items.map((entry) => [entry.path, entry.text]));
	const raw = await callLLM({
		model: TRANSLATE_MODEL,
		system: buildSystemPrompt(lang, voice),
		user: JSON.stringify(source, null, 1),
		maxTokens: answerTokens(items),
		jsonMode: true,
	});

	return acceptAnswers(items, raw);
}
