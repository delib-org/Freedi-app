// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  isFirestoreInternalCrash,
  isTransientAuthNetworkError,
} from "@freedi/shared-utils";

// No firebaseChunkNames: Next.js emits hashed chunk names with nothing to
// match on, so only the Firestore SDK's unmistakable assertion message is
// filtered here. The null-dereference variants stay reported — without frames
// there is no honest way to tell an SDK crash from an app-code one.

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
    const error = hint?.originalException;
    const err = error as { name?: string; code?: string } | undefined;
    if (err?.name === "FirebaseError" && err?.code === "unavailable") {
      return null;
    }

    if (isFirestoreInternalCrash(event, error)) {
      return null;
    }

    if (isTransientAuthNetworkError(event, error)) {
      return null;
    }

    return event;
  },
});
