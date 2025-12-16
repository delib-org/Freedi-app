import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

// Force dynamic rendering (not static)
export const dynamic = 'force-dynamic';

/**
 * GET /api/sentry-example-api
 *
 * This API route is used to test Sentry error tracking on the server side.
 * It intentionally throws an error that should be captured by Sentry.
 *
 * IMPORTANT: Remove this route before deploying to production.
 */
export async function GET() {
  // Capture a test error with context
  Sentry.captureException(
    new Error('Sentry Test Error: This is a test error from the server API route'),
    {
      tags: {
        test: 'true',
        source: 'api-route',
      },
      extra: {
        timestamp: new Date().toISOString(),
        route: '/api/sentry-example-api',
      },
    }
  );

  // Return error response instead of throwing (to avoid build issues)
  // The error has already been captured by Sentry above
  return NextResponse.json(
    {
      error: 'Test error triggered',
      message: 'This error has been sent to Sentry',
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}
