import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { logError } from './errorHandling';

/** Shared across instances, unlike the in-memory limiter in rateLimit.ts. */
const RATE_LIMIT_COLLECTION = 'mcAiRateLimits';
const MINUTE_MS = 60 * 1000;
const STATUS_TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;

export interface VerifiedUidLimit {
  /** Stable name of the limited action; part of the document id. */
  action: string;
  maxRequests: number;
  windowMs: number;
}

export const AI_UID_RATE_LIMIT = {
  feedback: { action: 'ai-feedback', maxRequests: 5, windowMs: MINUTE_MS },
  rewriteComment: { action: 'ai-rewrite-comment', maxRequests: 10, windowMs: MINUTE_MS },
} as const satisfies Record<string, VerifiedUidLimit>;

interface WindowCounter {
  count: number;
  resetAt: number;
}

/**
 * Next counter for a fixed window, or null when the call exceeds the limit.
 * Pure so the window arithmetic can be tested without Firestore.
 */
export function nextWindowCounter(
  current: WindowCounter | undefined,
  limit: VerifiedUidLimit,
  now: number
): WindowCounter | null {
  if (!current || current.resetAt <= now) {
    return { count: 1, resetAt: now + limit.windowMs };
  }

  if (current.count >= limit.maxRequests) return null;

  return { count: current.count + 1, resetAt: current.resetAt };
}

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests', retryAfter: retryAfterSeconds },
    { status: STATUS_TOO_MANY_REQUESTS, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/**
 * Cap a verified uid across all server instances.
 *
 * @returns A 429 response when over the limit, otherwise null. A Firestore
 * failure allows the call: the in-memory limit still applies, and an outage of
 * the counter should not take the feature down.
 */
export async function checkVerifiedUidLimit(
  userId: string,
  limit: VerifiedUidLimit
): Promise<NextResponse | null> {
  try {
    const db = getFirestoreAdmin();
    const ref = db.collection(RATE_LIMIT_COLLECTION).doc(`${limit.action}--${userId}`);
    const now = Date.now();

    const retryAfterMs = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? (snapshot.data() as WindowCounter) : undefined;
      const next = nextWindowCounter(current, limit, now);
      if (!next) return (current?.resetAt ?? now) - now;

      transaction.set(ref, next);

      return 0;
    });

    return retryAfterMs > 0 ? tooManyRequests(Math.ceil(retryAfterMs / MS_PER_SECOND)) : null;
  } catch (error) {
    logError(error, {
      operation: 'verifiedUidRateLimit.checkVerifiedUidLimit',
      userId,
      metadata: { action: limit.action },
    });

    return null;
  }
}
