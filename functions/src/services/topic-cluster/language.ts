import franc from 'franc-min';

// franc returns ISO 639-3 codes; map common ones to ISO 639-1 for prompt/output use.
const ISO3_TO_ISO1: Record<string, string> = {
	eng: 'en',
	heb: 'he',
	arb: 'ar', // Modern Standard Arabic — most franc Arabic detections
	ara: 'ar',
	rus: 'ru',
	spa: 'es',
	deu: 'de',
	nld: 'nl',
	fra: 'fr',
	cmn: 'zh',
	jpn: 'ja',
	kor: 'ko',
	ita: 'it',
	por: 'pt',
	tur: 'tr',
	ukr: 'uk',
	pol: 'pl',
	hin: 'hi',
};

/**
 * Detect the language of a text string. Combines:
 * 1. Unicode-block sniffing for short strings (<40 chars) — franc-min is unreliable
 *    on very short text, especially for non-Latin scripts.
 * 2. franc-min for everything else.
 *
 * Returns ISO 639-1 code. 'und' if undetermined.
 */
export function detectLanguage(text: string): string {
	const t = text.trim();
	if (!t) return 'und';

	// Block sniff first — fast, deterministic, robust on short strings.
	const block = sniffBlock(t);
	if (block) return block;

	// franc-min for longer Latin-script strings.
	if (t.length < 10) return 'und';
	const code3 = franc(t, { minLength: 3 });
	if (code3 === 'und') return 'und';

	return ISO3_TO_ISO1[code3] ?? code3;
}

function sniffBlock(text: string): string | null {
	let hebrew = 0;
	let arabic = 0;
	let cjk = 0;
	let cyrillic = 0;
	let total = 0;
	for (const ch of text) {
		const cp = ch.codePointAt(0);
		if (cp === undefined) continue;
		if (cp >= 0x590 && cp <= 0x5ff) hebrew++;
		else if (cp >= 0x600 && cp <= 0x6ff) arabic++;
		else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
		else if (cp >= 0x400 && cp <= 0x4ff) cyrillic++;
		if (/\p{L}/u.test(ch)) total++;
	}
	if (total === 0) return null;
	if (hebrew / total > 0.3) return 'he';
	if (arabic / total > 0.3) return 'ar';
	if (cjk / total > 0.3) return 'zh';
	if (cyrillic / total > 0.3) return 'ru';

	return null;
}

/**
 * Pick the dominant language across a list of detections. Used for the taxonomy
 * step (which produces names in the dominant language).
 */
export function dominantLanguage(codes: string[]): string {
	const counts = new Map<string, number>();
	for (const c of codes) {
		if (c === 'und') continue;
		counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	if (counts.size === 0) return 'en';
	let best: [string, number] = ['en', 0];
	for (const entry of counts) {
		if (entry[1] > best[1]) best = entry;
	}

	return best[0];
}
