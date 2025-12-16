'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

/**
 * Sentry Example Page
 *
 * This page is used to test that Sentry is properly configured.
 * Visit /sentry-example-page to trigger test errors and verify they appear in Sentry.
 *
 * IMPORTANT: Remove this page before deploying to production, or restrict access to it.
 */
export default function SentryExamplePage() {
  const [clientErrorTriggered, setClientErrorTriggered] = useState(false);
  const [sentryEventId, setSentryEventId] = useState<string | null>(null);

  const triggerClientError = () => {
    setClientErrorTriggered(true);

    // Capture a test error
    const eventId = Sentry.captureException(
      new Error('Sentry Test Error: This is a test error from the client')
    );
    setSentryEventId(eventId);
  };

  const triggerUnhandledError = () => {
    // This will trigger an unhandled error that Sentry should catch
    throw new Error('Sentry Test: Unhandled client-side error');
  };

  const triggerServerError = async () => {
    try {
      const response = await fetch('/api/sentry-example-api');
      const data = await response.json();
      console.info('Server response:', data);
    } catch (error) {
      console.error('Failed to trigger server error:', error);
    }
  };

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ marginBottom: '1rem' }}>Sentry Integration Test</h1>

      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Use this page to verify that Sentry is properly configured for the Mass Consensus app.
        Click the buttons below to trigger test errors.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Client-side captured error */}
        <button
          onClick={triggerClientError}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#5469d4',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Trigger Captured Client Error
        </button>

        {clientErrorTriggered && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#e8f5e9',
            borderRadius: '8px',
            border: '1px solid #4caf50'
          }}>
            <p style={{ margin: 0, color: '#2e7d32' }}>
              Error captured and sent to Sentry.
              {sentryEventId && (
                <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                  Event ID: <code>{sentryEventId}</code>
                </span>
              )}
            </p>
          </div>
        )}

        {/* Unhandled client error */}
        <button
          onClick={triggerUnhandledError}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Trigger Unhandled Client Error
        </button>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: '-0.5rem 0 0 0' }}>
          This will crash the page. Refresh after clicking.
        </p>

        {/* Server-side error */}
        <button
          onClick={triggerServerError}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#ed6c02',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Trigger Server Error
        </button>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: '-0.5rem 0 0 0' }}>
          This triggers an API route error.
        </p>
      </div>

      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#fff3e0',
        borderRadius: '8px',
        border: '1px solid #ff9800'
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#e65100' }}>Note</h3>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          After triggering errors, check your Sentry dashboard to verify they appear.
          Errors may take a few seconds to appear in Sentry.
        </p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#999' }}>
        <p>
          DSN configured: {process.env.NEXT_PUBLIC_SENTRY_DSN ? 'Yes' : 'No'}
        </p>
      </div>
    </div>
  );
}
