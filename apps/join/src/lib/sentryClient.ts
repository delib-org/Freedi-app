import { init, setUser, captureException, withScope } from '@sentry/browser';
import type { BrowserOptions } from '@sentry/browser';

/** The deferred half of `lib/sentry.ts` — the only module that actually pulls
 *  `@sentry/browser` into the graph, so it lands in its own chunk.
 *
 *  Why this file exists rather than `await import('@sentry/browser')` at the
 *  call site: a namespace import is opaque to the bundler, so rollup has to
 *  assume every export is live and keeps `replayIntegration`,
 *  `feedbackIntegration` and `replayCanvasIntegration` — ~180 kB raw of
 *  features this app never turns on. Naming the four functions we use lets
 *  tree-shaking drop the rest. */

export type { BrowserOptions };

export function initClient(options: BrowserOptions): void {
	init(options);
}

export { setUser, captureException, withScope };
