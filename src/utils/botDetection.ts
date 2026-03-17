/**
 * Detects bots/crawlers that report serviceWorker support
 * but can't actually register service workers, causing false Sentry errors.
 */
export const isBot = (): boolean => {
	const userAgent = navigator.userAgent.toLowerCase();

	return /bot|crawl|spider|slurp|google-read-aloud|mediapartners|adsbot|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot/.test(
		userAgent,
	);
};
