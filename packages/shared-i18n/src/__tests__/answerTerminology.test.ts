/**
 * The reviewed list of main-app keys whose values name "the thing people add
 * and rate". The word for it is Answer / תשובה: IA spec
 * docs/ia/main-question-clarity.md, section 3.1. A value in this list must not
 * bring back one of the retired synonyms.
 */

import en from '../languages/en.json';
import he from '../languages/he.json';
import keysList from './answerTerminology.keys.json';

interface ReviewedKey {
	key: string;
	oldEn: string | null;
	newEn: string;
}

type Dictionary = Record<string, string>;

const reviewed: ReviewedKey[] = keysList;
const enDictionary: Dictionary = en;
const heDictionary: Dictionary = he;

const BANNED_EN = /\b(options?|solutions?|suggestions?|ideas?|proposals?)\b/i;
const BANNED_HE = /אפשרו|הצע|הציע|פתרו|רעיו/;

const offenders = (dictionary: Dictionary, banned: RegExp): string[] =>
	reviewed.filter(({ key }) => banned.test(dictionary[key] ?? '')).map(({ key }) => key);

describe('answer terminology (reviewed key list)', () => {
	it('has a non-empty list with no duplicate keys', () => {
		const keys = reviewed.map(({ key }) => key);

		expect(keys.length).toBeGreaterThan(0);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('every reviewed key exists in en and he', () => {
		const missing = reviewed
			.map(({ key }) => key)
			.filter((key) => !(key in enDictionary) || !(key in heDictionary));

		expect(missing).toEqual([]);
	});

	it('no reviewed new value in the list itself uses a banned English synonym', () => {
		expect(reviewed.filter(({ newEn }) => BANNED_EN.test(newEn)).map(({ key }) => key)).toEqual([]);
	});

	it('no reviewed English value uses a banned synonym', () => {
		expect(offenders(enDictionary, BANNED_EN)).toEqual([]);
	});

	it('no reviewed Hebrew value uses a banned synonym', () => {
		expect(offenders(heDictionary, BANNED_HE)).toEqual([]);
	});
});
