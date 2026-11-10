/**
 * Every key the main app reads must exist in all 7 languages, otherwise the
 * app silently shows the English key. "Reads" means either a literal
 * t('Key') call, which must exist in en.json too, or any other string in
 * `src/` that is already a key of en.json (a label held in a variable and
 * translated later).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ar, de, en, es, fa, he, nl } from '../languages';

type Dictionary = Record<string, string>;

const ROOT_SRC = resolve(__dirname, '../../../../src');
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\./;
const SKIPPED_DIRECTORIES = new Set(['__tests__', 'node_modules']);
/** Longest string considered a key; a single quote pair can span a long line. */
const MAX_KEY_LENGTH = 500;
const ESCAPED_QUOTE_PLACEHOLDER = '\u0001';
const TRANSLATE_CALL =
	/\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)\s*[,)]/g;

/**
 * Keys used only in dead code that plan item 1.12 removes (QuestionPage,
 * StageExplanation and similar). Translating them would be wasted. Delete this
 * list with that code.
 */
const DEAD_CODE_KEYS = new Set([
	'Connected questions worth discussing',
	"Don't show again",
	"Don't show explanations again",
	'New Option Graphic',
	'Research Graphic',
	'Solutions for discussed issue',
	'Topic description',
	'View My Suggestions',
	'e.g., Focus on practical solutions, highlight consensus points...',
]);

const listSourceFiles = (directory: string): string[] =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isDirectory()) {
			return SKIPPED_DIRECTORIES.has(entry.name)
				? []
				: listSourceFiles(join(directory, entry.name));
		}
		if (!SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) return [];

		return [join(directory, entry.name)];
	});

/**
 * Every substring between two consecutive quote marks of one kind. Scanning
 * with a lookahead keeps wrong pairs but cannot lose a right one, so an
 * apostrophe in JSX text never hides the key next to it.
 */
const quotedStrings = (text: string, quote: string): string[] => {
	const escaped = text.split(`\\${quote}`).join(ESCAPED_QUOTE_PLACEHOLDER);
	const pattern = new RegExp(`${quote}(?=([^${quote}\\n]{1,${MAX_KEY_LENGTH}})${quote})`, 'g');
	const found: string[] = [];
	let match = pattern.exec(escaped);
	while (match) {
		found.push(match[1].split(ESCAPED_QUOTE_PLACEHOLDER).join(quote));
		match = pattern.exec(escaped);
	}

	return found;
};

const translateCallKeys = (text: string): string[] =>
	[...text.matchAll(TRANSLATE_CALL)].map((match) =>
		(match[1] ?? match[2] ?? match[3]).replace(/\\(['"`])/g, '$1'),
	);

const findKeysUsedByMainApp = (): string[] => {
	const dictionary: Dictionary = en;
	const used = new Set<string>();
	for (const file of listSourceFiles(ROOT_SRC)) {
		const text = readFileSync(file, 'utf8');
		for (const key of translateCallKeys(text)) {
			if (!DEAD_CODE_KEYS.has(key)) used.add(key);
		}
		for (const quote of [`'`, `"`, '`']) {
			for (const candidate of quotedStrings(text, quote)) {
				if (Object.prototype.hasOwnProperty.call(dictionary, candidate)) used.add(candidate);
			}
		}
	}

	return [...used].sort();
};

describe('language parity for the main app', () => {
	const usedKeys = findKeysUsedByMainApp();

	it('finds the main app keys', () => {
		expect(usedKeys.length).toBeGreaterThan(1000);
		expect(usedKeys).toContain('Add an answer');
	});

	const languages: Array<[string, Dictionary]> = [
		['en', en],
		['he', he],
		['ar', ar],
		['de', de],
		['es', es],
		['nl', nl],
		['fa', fa],
	];

	it.each(languages)('%s has every key the main app uses', (_name, dictionary) => {
		const missing = usedKeys.filter(
			(key) => !Object.prototype.hasOwnProperty.call(dictionary, key),
		);

		expect(missing).toEqual([]);
	});
});
