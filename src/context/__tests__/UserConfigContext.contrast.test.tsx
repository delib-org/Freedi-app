import React from 'react';
import { act, render } from '@testing-library/react';
import { UserConfigProvider, UserConfigContext } from '../UserConfigContext';
import type { UserConfigContextType } from '../UserConfigContext';

jest.mock('@freedi/shared-i18n', () => ({
	LanguagesEnum: { en: 'en', he: 'he' },
	DEFAULT_LANGUAGE: 'en',
	getDirection: () => 'ltr',
	getRowDirection: () => 'row',
	loadLanguageData: () => Promise.resolve({}),
}));

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

describe('UserConfigContext high contrast attribute', () => {
	beforeEach(() => {
		localStorage.clear();
		delete document.documentElement.dataset.contrast;
		document.documentElement.removeAttribute('style');
	});

	it('mirrors the colorContrast setting onto <html data-contrast> without inline styles', () => {
		let ctx: UserConfigContextType | undefined;

		render(
			<UserConfigProvider>
				<UserConfigContext.Consumer>
					{(value) => {
						ctx = value;

						return null;
					}}
				</UserConfigContext.Consumer>
			</UserConfigProvider>,
		);

		expect(document.documentElement.dataset.contrast).toBe('normal');

		act(() => {
			ctx?.setColorContrast(true);
		});

		expect(document.documentElement.dataset.contrast).toBe('high');
		// Inline custom properties would outrank the dark-mode stylesheet.
		expect(document.documentElement.style.getPropertyValue('--text-body')).toBe('');
	});
});
