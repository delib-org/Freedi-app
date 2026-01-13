// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment
  environment: process.env.NODE_ENV,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Session Replay - capture user sessions for debugging
  replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0, // Sample 10% of sessions in production

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Additional replay options
      maskAllText: false, // Set to true if you want to mask all text
      blockAllMedia: false, // Set to true if you want to block all media
    }),
  ],

  // Ignore certain errors that are not actionable
  ignoreErrors: [
    // Browser extensions
    /chrome-extension/,
    /moz-extension/,
    /safari-extension/,
    // Network errors
    'Failed to fetch',
    'NetworkError',
    'Load failed',
    'Network request failed',
    // Common third-party errors
    'ResizeObserver loop',
    'ResizeObserver loop limit exceeded',
    // User-cancelled requests
    'AbortError',
    'The operation was aborted',
    // Vercel Live feedback instrumentation errors (null references during lifecycle events)
    "Cannot read properties of null (reading 'getItem')",
    "Cannot read properties of null (reading 'removeEventListener')",
    // IndexedDB errors (common in Facebook in-app browser on iOS)
    'Connection to Indexed Database server lost',
    /IndexedDB.*lost/,
  ],

  // Don't send PII
  sendDefaultPii: false,

  // Before sending an event, you can modify or filter it
  beforeSend(event) {
    // Remove potentially sensitive data from URLs
    if (event.request?.url) {
      const url = new URL(event.request.url);
      // Remove query parameters that might contain sensitive data
      url.searchParams.delete('token');
      url.searchParams.delete('userId');
      event.request.url = url.toString();
    }

    return event;
  },
});
