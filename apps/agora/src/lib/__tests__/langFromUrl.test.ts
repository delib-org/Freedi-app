import { describe, it, expect } from 'vitest';
import { langFromUrl } from '../i18n';

/**
 * A player walking through an Odyssey gate arrives on a hash-router URL, so
 * the language the voyage asked for is inside the fragment where
 * `location.search` cannot reach it. Getting this wrong is silent: the app
 * falls back to `navigator.language` and a Hebrew reader on an English browser
 * gets an English square, which is exactly the bug this exists to prevent.
 */
describe('langFromUrl', () => {
	it('reads the gate link Odyssey actually builds', () => {
		expect(
			langFromUrl('https://agora-wizcol.web.app/#!/join/12345?theme=odyssey&lang=he&handoff=abc'),
		).toBe('he');
	});

	it('reads a plain query on the origin', () => {
		expect(langFromUrl('https://agora-wizcol.web.app/?lang=ar')).toBe('ar');
	});

	it('reads a plain query that also carries a fragment', () => {
		expect(langFromUrl('https://agora-wizcol.web.app/?lang=es#!/teach')).toBe('es');
	});

	it('lets the fragment win, because that is where the gate writes', () => {
		expect(langFromUrl('https://agora-wizcol.web.app/?lang=en#!/join/12345?lang=he')).toBe('he');
	});

	it('is null when no language is asked for', () => {
		expect(langFromUrl('https://agora-wizcol.web.app/#!/join/12345?theme=odyssey')).toBeNull();
		expect(langFromUrl('https://agora-wizcol.web.app/')).toBeNull();
	});

	it('ignores a language the app does not speak', () => {
		expect(langFromUrl('https://agora-wizcol.web.app/#!/join/12345?lang=fr')).toBeNull();
		expect(langFromUrl('https://agora-wizcol.web.app/#!/join/12345?lang=')).toBeNull();
	});
});
