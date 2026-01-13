// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable Sentry in production
  enabled: process.env.NODE_ENV === 'production',

  // Environment
  environment: process.env.NODE_ENV,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Ignore certain errors that are not actionable
  ignoreErrors: [
    // Network errors that are expected
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    // Firebase errors that are expected
    'permission-denied',
    'unauthenticated',
  ],

  // Before sending an event
  beforeSend(event) {
    // Filter out health check requests
    if (event.request?.url?.includes('/api/health')) {
      return null;
    }

    return event;
  },
});
