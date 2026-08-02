import { isBot } from '../botDetection';

const CHROME_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

const setNavigator = (userAgent: string, webdriver = false): void => {
	Object.defineProperty(window.navigator, 'userAgent', {
		value: userAgent,
		configurable: true,
	});
	Object.defineProperty(window.navigator, 'webdriver', {
		value: webdriver,
		configurable: true,
	});
};

describe('botDetection', () => {
	describe('isBot', () => {
		it('returns false for a regular browser', () => {
			setNavigator(CHROME_UA);
			expect(isBot()).toBe(false);
		});

		it('returns true for crawler user agents', () => {
			setNavigator('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
			expect(isBot()).toBe(true);

			setNavigator('facebookexternalhit/1.1');
			expect(isBot()).toBe(true);
		});

		it('returns true when navigator.webdriver is set, even with a normal user agent', () => {
			// Playwright/Puppeteer stub serviceWorker.register() so it resolves
			// undefined — every registration dereference then throws.
			setNavigator(CHROME_UA, true);
			expect(isBot()).toBe(true);
		});

		it('returns true for headless and automation user agents', () => {
			setNavigator(
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/119.0.0.0 Safari/537.36',
			);
			expect(isBot()).toBe(true);

			setNavigator(`${CHROME_UA} Playwright/1.40`);
			expect(isBot()).toBe(true);
		});
	});
});
