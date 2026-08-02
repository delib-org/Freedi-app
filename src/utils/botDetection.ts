/**
 * Detects automation harnesses (Playwright, Puppeteer, Selenium, headless
 * Chrome). They report full serviceWorker support but commonly stub
 * `serviceWorker.register()` so it resolves `undefined`, which makes every
 * `registration.installing` / `.waiting` dereference throw — ours and
 * workbox-window's alike.
 */
const isAutomatedBrowser = (): boolean => {
	if (navigator.webdriver) {
		return true;
	}

	const userAgent = navigator.userAgent.toLowerCase();

	return /headless|playwright|puppeteer|selenium|webdriver/.test(userAgent);
};

/**
 * Detects bots/crawlers/automation that report serviceWorker support
 * but can't actually register service workers, causing false Sentry errors.
 */
export const isBot = (): boolean => {
	if (isAutomatedBrowser()) {
		return true;
	}

	const userAgent = navigator.userAgent.toLowerCase();

	return /bot|crawl|spider|slurp|google-read-aloud|mediapartners|adsbot|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot/.test(
		userAgent,
	);
};
