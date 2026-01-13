/**
 * Instrumentation file for Next.js
 *
 * This file is used to register instrumentation hooks that run when the
 * Next.js server starts. It's the recommended way to initialize Sentry
 * in Next.js 13+.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
