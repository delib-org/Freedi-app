import type { TranslationDictionary } from './translator';

/**
 * Keep only the given keys of a dictionary.
 *
 * A full dictionary is ~5,000 entries (~300KB). Server-rendered apps pass the
 * dictionary to the client inside the page payload, so sending only the keys
 * the app can actually ask for keeps every HTML response small. Keys missing
 * from the dictionary are skipped, so the result never invents entries.
 */
export function pickTranslations(
	dictionary: TranslationDictionary,
	keys: readonly string[]
): TranslationDictionary {
	const picked: TranslationDictionary = {};
	for (const key of keys) {
		const value = dictionary[key];
		if (value !== undefined) {
			picked[key] = value;
		}
	}

	return picked;
}
