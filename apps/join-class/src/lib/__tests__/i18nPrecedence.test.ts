import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Language precedence (Trello 7V73MGVR): the teacher's lock for the lesson,
 * then ?lang=, then the student's own saved choice, then Hebrew. The phone's
 * language plays no part. i18n.ts keeps module state, so each test loads a
 * fresh copy against a stubbed browser.
 */

vi.mock('@/lib/deferWork', () => ({ afterLoad: (): void => undefined }));

const STORAGE_KEY = 'freedi_joinclass_lang';

interface Browser {
	storage: Map<string, string>;
	document: { documentElement: { dir: string; lang: string } };
}

function stubBrowser(options: {
	search?: string;
	saved?: string;
	phoneLanguage?: string;
}): Browser {
	const storage = new Map<string, string>();
	if (options.saved) storage.set(STORAGE_KEY, options.saved);
	const document = { documentElement: { dir: '', lang: '' } };
	vi.stubGlobal('window', {
		location: { search: options.search ?? '' },
		setTimeout: (fn: () => void) => setTimeout(fn, 0),
		requestIdleCallback: undefined,
	});
	vi.stubGlobal('document', document);
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => storage.get(k) ?? null,
		setItem: (k: string, v: string) => void storage.set(k, v),
	});
	vi.stubGlobal('navigator', { language: options.phoneLanguage ?? 'en-US' });

	return { storage, document };
}

async function freshI18n(): Promise<typeof import('../i18n')> {
	vi.resetModules();

	return import('../i18n');
}

describe('language precedence', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('opens in Hebrew on a phone set to English', async () => {
		const { document } = stubBrowser({ phoneLanguage: 'en-US' });
		const i18n = await freshI18n();
		await i18n.initI18n();

		expect(i18n.getLang()).toBe('he');
		expect(document.documentElement.dir).toBe('rtl');
	});

	it('opens in Hebrew on a phone set to another supported language', async () => {
		stubBrowser({ phoneLanguage: 'de-DE' });
		const i18n = await freshI18n();
		await i18n.initI18n();

		expect(i18n.getLang()).toBe('he');
	});

	it('keeps the student own saved choice across a reload', async () => {
		stubBrowser({ saved: 'ar' });
		const i18n = await freshI18n();
		await i18n.initI18n();

		expect(i18n.getLang()).toBe('ar');
	});

	it('saves a choice made with the language button', async () => {
		const { storage } = stubBrowser({});
		const i18n = await freshI18n();
		await i18n.initI18n();
		i18n.setLang('es');
		await vi.waitFor(() => expect(i18n.getLang()).toBe('es'));

		expect(storage.get(STORAGE_KEY)).toBe('es');
	});

	it('lets ?lang= win over the saved choice', async () => {
		stubBrowser({ search: '?lang=nl', saved: 'ar' });
		const i18n = await freshI18n();
		await i18n.initI18n();

		expect(i18n.getLang()).toBe('nl');
	});

	it("lets the teacher's lock win over a saved choice and ?lang=, and hides the choice", async () => {
		stubBrowser({ search: '?lang=nl', saved: 'ar' });
		const i18n = await freshI18n();
		await i18n.initI18n();
		i18n.applyStatementLanguage('en', true);
		await vi.waitFor(() => expect(i18n.getLang()).toBe('en'));

		expect(i18n.isLanguageForced()).toBe(true);
	});

	it('ignores a language switch while locked', async () => {
		const { storage } = stubBrowser({ saved: 'ar' });
		const i18n = await freshI18n();
		await i18n.initI18n();
		i18n.applyStatementLanguage('en', true);
		await vi.waitFor(() => expect(i18n.getLang()).toBe('en'));
		i18n.setLang('de');

		expect(i18n.getLang()).toBe('en');
		expect(storage.get(STORAGE_KEY)).toBe('ar');
	});

	it("restores the student's own choice when the lock is removed", async () => {
		stubBrowser({ saved: 'ar' });
		const i18n = await freshI18n();
		await i18n.initI18n();
		i18n.applyStatementLanguage('en', true);
		await vi.waitFor(() => expect(i18n.getLang()).toBe('en'));
		i18n.releaseForcedLanguage();
		await vi.waitFor(() => expect(i18n.getLang()).toBe('ar'));

		expect(i18n.isLanguageForced()).toBe(false);
	});

	it('goes back to Hebrew when the lock is removed and the student chose nothing', async () => {
		stubBrowser({});
		const i18n = await freshI18n();
		await i18n.initI18n();
		i18n.applyStatementLanguage('en', true);
		await vi.waitFor(() => expect(i18n.getLang()).toBe('en'));
		i18n.releaseForcedLanguage();
		await vi.waitFor(() => expect(i18n.getLang()).toBe('he'));
	});

	it('restores the own choice when the lesson keeps its language but drops force', async () => {
		stubBrowser({ saved: 'ar' });
		const i18n = await freshI18n();
		await i18n.initI18n();
		i18n.applyStatementLanguage('en', true);
		await vi.waitFor(() => expect(i18n.getLang()).toBe('en'));
		i18n.applyStatementLanguage('en', false);
		await vi.waitFor(() => expect(i18n.getLang()).toBe('ar'));

		expect(i18n.isLanguageForced()).toBe(false);
	});
});
