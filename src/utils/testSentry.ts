import { captureException } from '../services/monitoring/sentry';

// Test function to verify Sentry is working
export function testSentryError() {
	try {
		throw new Error(
			'Test Sentry Error - This is a test error to verify Sentry integration is working',
		);
	} catch (error) {
		captureException(error as Error, {
			test: true,
			timestamp: new Date().toISOString(),
			action: 'manual_test',
		});
		console.info(
			'Test error sent to Sentry. Check your Sentry dashboard to verify it was received.',
		);
	}
}

// Add to window for easy testing in console
if (import.meta.env.DEV) {
	(window as Window & { testSentryError?: typeof testSentryError }).testSentryError =
		testSentryError;
}
