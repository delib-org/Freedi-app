/**
 * Client-side Sentry: captures unhandled errors and SvelteKit `handleError`
 * calls in the browser. Init is production-only (see `$lib/sentry`).
 */
import * as Sentry from '@sentry/sveltekit';
import { sentryEnabled, sharedIgnoreErrors, sharedSentryOptions } from '$lib/sentry';

if (sentryEnabled) {
	Sentry.init({
		...sharedSentryOptions,
		integrations: [Sentry.browserTracingIntegration()],
		ignoreErrors: sharedIgnoreErrors,
		beforeSend(event, hint) {
			const error = hint.originalException;

			// Cancelled requests (navigation aborts) are expected, not errors.
			if (error instanceof Error && error.message?.includes('cancelled')) {
				return null;
			}

			// Firestore offline — happens constantly on flaky mobile networks.
			const firebaseErr = error as { name?: string; code?: string } | undefined;
			if (firebaseErr?.name === 'FirebaseError' && firebaseErr?.code === 'unavailable') {
				return null;
			}

			// Don't send events with no error attached.
			if (!event.exception && !event.message) {
				return null;
			}

			return event;
		},
	});
}

export const handleError = Sentry.handleErrorWithSentry();
