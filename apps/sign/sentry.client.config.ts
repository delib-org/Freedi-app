// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Ignore Firestore offline errors (user device lost connection — not actionable)
  ignoreErrors: [
    "Failed to get document because the client is offline",
    "Could not reach Cloud Firestore backend",
  ],

  beforeSend(event, hint) {
    const err = hint?.originalException as
      | { name?: string; code?: string }
      | undefined;
    if (err?.name === "FirebaseError" && err?.code === "unavailable") {
      return null;
    }
    return event;
  },
});
