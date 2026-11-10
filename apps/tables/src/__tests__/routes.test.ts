import { describe, expect, it, vi } from 'vitest';
import { buildRouteTable } from '../router';
import { ROUTES, matchRoute } from '../routes';
import { detectLanguage } from '../lib/i18n';
import he from '../lib/locales/he';
import en from '../lib/locales/en';
import ar from '../lib/locales/ar';

// The screens import Firebase; the route table only needs them to exist, not to connect.
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => '' } }));

const SAMPLE_ID = 'abc123';

const CONCRETE_PATHS: ReadonlyArray<[string, string]> = [
	['/host', 'tableAssignment.screen.hostList'],
	['/host/new', 'tableAssignment.setup.title'],
	[`/host/sessions/${SAMPLE_ID}`, 'tableAssignment.session'],
	[`/host/sessions/${SAMPLE_ID}/screen`, 'tableAssignment.roomScreen'],
	[`/host/sessions/${SAMPLE_ID}/topics`, 'tableAssignment.session'],
	[`/host/sessions/${SAMPLE_ID}/settings`, 'tableAssignment.session'],
	[`/host/sessions/${SAMPLE_ID}/participants`, 'tableAssignment.screen.participants'],
	[`/host/sessions/${SAMPLE_ID}/preview`, 'tableAssignment.screen.preview'],
	[`/host/sessions/${SAMPLE_ID}/assignment`, 'tableAssignment.screen.assignment'],
	[`/sessions/${SAMPLE_ID}`, 'tableAssignment.session'],
	[`/sessions/${SAMPLE_ID}/name`, 'tableAssignment.editDetails'],
	[`/sessions/${SAMPLE_ID}/preferences`, 'tableAssignment.rank'],
	[`/sessions/${SAMPLE_ID}/position`, 'tableAssignment.position'],
	[`/sessions/${SAMPLE_ID}/topics`, 'tableAssignment.session'],
	[`/sessions/${SAMPLE_ID}/topics/t1`, 'tableAssignment.session'],
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
