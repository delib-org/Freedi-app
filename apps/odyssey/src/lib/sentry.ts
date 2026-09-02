import * as Sentry from '@sentry/browser';
import {
	buildSentryOptions,
	isUsableDsn,
	setErrorReporter,
	type LogContext,
} from '@freedi/shared-utils';

/**
 * Error reporting for the odyssey app.
 *
 * Sentry.init() installs handlers for uncaught errors and unhandled promise
 * rejections, which is the bulk of what goes unseen here today. Anything
 * reported through the shared logger is forwarded too, via setErrorReporter.
 *
 * The DSN is read per-app first so each app can have its own Sentry project,
 * falling back to the shared one. Either way every event carries an `app` tag,
 * so a shared project is still splittable.
 */
export function initSentry(): void {
	const dsn =
		(import.meta.env.VITE_SENTRY_DSN_ODYSSEY as string | undefined) ||
		(import.meta.env.VITE_SENTRY_DSN as string | undefined);

	if (!import.meta.env.PROD || !isUsableDsn(dsn)) return;

	Sentry.init(
		buildSentryOptions<Sentry.ErrorEvent>({
			dsn,
			app: 'odyssey',
			release: import.meta.env.VITE_APP_VERSION as string | undefined,
			environment: (import.meta.env.VITE_ENVIRONMENT as string | undefined) || 'production',
		}),
	);

	setErrorReporter((error: unknown, context: LogContext) => {
		Sentry.captureException(error, {
			tags: context.operation ? { operation: context.operation } : undefined,
			user: context.userId ? { id: context.userId } : undefined,
			extra: { ...context, ...context.metadata },
		});
	});
}
