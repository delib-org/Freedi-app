import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draw } from '@/views/__tests__/vnodeText';

const state = vi.hoisted(() => ({ forced: false, lang: 'he' }));
const setLang = vi.hoisted(() => vi.fn());

vi.mock('@/lib/i18n', () => ({
	isLanguageForced: () => state.forced,
	getLang: () => state.lang,
	setLang,
	t: (key: string) => key,
	getAvailableLanguages: () => [
		{ code: 'en', name: 'English' },
		{ code: 'he', name: 'עברית' },
	],
}));
vi.mock('@/styles/language-button.scss', () => ({}));

import { LanguageButton } from '../LanguageButton';

function render(): unknown {
	return (LanguageButton.view as (v: unknown) => unknown)({ attrs: {}, children: [] });
}

describe('LanguageButton', () => {
	beforeEach(() => {
		state.forced = false;
		state.lang = 'he';
		setLang.mockReset();
	});

	it('is drawn for a student with every language to pick from', () => {
		const out = draw(render() as Parameters<typeof draw>[0]);

		expect(out.classes).toContain('language-button');
		expect(out.text).toEqual(expect.arrayContaining(['English', 'עברית']));
	});

	it('is not drawn at all while the teacher has locked the language', () => {
		state.forced = true;

		expect(render()).toBeNull();
	});
});
