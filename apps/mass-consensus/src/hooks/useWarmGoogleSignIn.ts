import { useEffect } from 'react';
import { warmGoogleSignIn } from '@/lib/firebase/client';

/** Fallback delay where requestIdleCallback is missing (Safari). */
const IDLE_FALLBACK_MS = 1500;

/**
 * Loads Google's sign-in iframe once the browser is idle, so a tap on
 * "Sign in with Google" can open its popup at once (iOS Safari blocks a popup
 * that opens after an await). Use only in components that show that button —
 * never on plain student pages, where the iframe would be ~100KB for nothing.
 */
export function useWarmGoogleSignIn(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const warm = () => {
      void warmGoogleSignIn();
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm);

      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, IDLE_FALLBACK_MS);

    return () => window.clearTimeout(timer);
  }, [enabled]);
}
