import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dictionary = (language: string): Record<string, string> =>
	JSON.parse(
		readFileSync(
			resolve(__dirname, `../../../packages/shared-i18n/src/languages/${language}.json`),
			'utf8',
		),
	);
it('provides every imported UX namespace in all seven languages', () => {
	const keys = Object.keys(dictionary('en')).filter((key) =>
		/^(host\.|question\.sheet\.|improve\.|firstRun\.)/.test(key),
	);
	expect(keys.length).toBeGreaterThan(60);
	for (const language of ['he', 'ar', 'de', 'es', 'fa', 'nl']) {
		const translated = dictionary(language);
		for (const key of keys) expect(translated[key]).toBeTruthy();
	}
});
