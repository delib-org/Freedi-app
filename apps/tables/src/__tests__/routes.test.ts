import { describe, expect, it } from 'vitest';
import { buildRouteTable } from '../router';
import { ROUTES, matchRoute } from '../routes';
import { detectLanguage } from '../lib/i18n';
import he from '../lib/locales/he';
import en from '../lib/locales/en';
import ar from '../lib/locales/ar';

const SAMPLE_ID = 'abc123';

const CONCRETE_PATHS: ReadonlyArray<[string, string]> = [
	['/host', 'tableAssignment.screen.hostList'],
	[`/host/sessions/${SAMPLE_ID}`, 'tableAssignment.screen.hostHome'],
	[`/host/sessions/${SAMPLE_ID}/topics`, 'tableAssignment.screen.topics'],
	[`/host/sessions/${SAMPLE_ID}/settings`, 'tableAssignment.screen.settings'],
	[`/host/sessions/${SAMPLE_ID}/participants`, 'tableAssignment.screen.participants'],
	[`/host/sessions/${SAMPLE_ID}/preview`, 'tableAssignment.screen.preview'],
	[`/host/sessions/${SAMPLE_ID}/assignment`, 'tableAssignment.screen.assignment'],
	[`/sessions/${SAMPLE_ID}`, 'tableAssignment.screen.participantHome'],
	[`/sessions/${SAMPLE_ID}/topics`, 'tableAssignment.screen.topics'],
	[`/sessions/${SAMPLE_ID}/preferences`, 'tableAssignment.screen.preferences'],
	[`/sessions/${SAMPLE_ID}/my-table`, 'tableAssignment.screen.myTable'],
];

describe('router', () => {
	it.each(CONCRETE_PATHS)('resolves %s to a view titled %s', (path, titleKey) => {
		const match = matchRoute(path);

		expect(match?.route.titleKey).toBe(titleKey);
	});

	it('extracts the session id', () => {
		expect(matchRoute(`/host/sessions/${SAMPLE_ID}/preview`)?.params).toEqual({ id: SAMPLE_ID });
	});

	it('returns null for an unknown path', () => {
		expect(matchRoute('/nope')).toBeNull();
		expect(matchRoute('/host/sessions')).toBeNull();
	});

	it('builds a view for every route', () => {
		const table = buildRouteTable();

		for (const route of ROUTES) {
			expect(typeof table[route.path].view).toBe('function');
		}
	});
});

describe('locales', () => {
	it('has every route title in he, en and ar', () => {
		for (const route of ROUTES) {
			for (const dictionary of [he, en, ar]) {
				expect(dictionary[route.titleKey]).toBeTruthy();
			}
		}
	});

	it('has the same keys in every language', () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(he).sort());
		expect(Object.keys(ar).sort()).toEqual(Object.keys(he).sort());
	});
});

describe('detectLanguage', () => {
	it('prefers ?lang=, then the saved choice, then the browser, then Hebrew', () => {
		expect(detectLanguage('?lang=ar', 'en', 'he-IL')).toBe('ar');
		expect(detectLanguage('', 'en', 'he-IL')).toBe('en');
		expect(detectLanguage('', null, 'ar-EG')).toBe('ar');
		expect(detectLanguage('', null, 'en-US')).toBe('he');
		expect(detectLanguage('', null, 'fr-FR')).toBe('he');
	});
});
