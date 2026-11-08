import { getFirestoreAdmin } from '@/lib/firebase/admin';
import {
  AI_UID_RATE_LIMIT,
  checkVerifiedUidLimit,
  nextWindowCounter,
  VerifiedUidLimit,
} from '../verifiedUidRateLimit';

jest.mock('@/lib/firebase/admin', () => ({ getFirestoreAdmin: jest.fn() }));

const limit: VerifiedUidLimit = { action: 'test', maxRequests: 2, windowMs: 1000 };
const NOW = 10_000;

describe('nextWindowCounter', () => {
  it('starts a window on the first call', () => {
    expect(nextWindowCounter(undefined, limit, NOW)).toEqual({ count: 1, resetAt: NOW + 1000 });
  });

  it('counts within the window', () => {
    expect(nextWindowCounter({ count: 1, resetAt: NOW + 5 }, limit, NOW)).toEqual({
      count: 2,
      resetAt: NOW + 5,
    });
  });

  it('refuses past the limit', () => {
    expect(nextWindowCounter({ count: 2, resetAt: NOW + 5 }, limit, NOW)).toBeNull();
  });

  it('starts over once the window has passed', () => {
    expect(nextWindowCounter({ count: 2, resetAt: NOW }, limit, NOW)).toEqual({
      count: 1,
      resetAt: NOW + 1000,
    });
  });
});

describe('checkVerifiedUidLimit', () => {
  const stored: Record<string, { count: number; resetAt: number }> = {};
  const docId = jest.fn();

  beforeEach(() => {
    Object.keys(stored).forEach((key) => delete stored[key]);
    docId.mockClear();
    (getFirestoreAdmin as jest.Mock).mockReturnValue({
      collection: () => ({
        doc: (id: string) => {
          docId(id);

          return { id };
        },
      }),
      runTransaction: async (run: (transaction: unknown) => Promise<number>) =>
        run({
          get: async ({ id }: { id: string }) => ({
            exists: Boolean(stored[id]),
            data: () => stored[id],
          }),
          set: ({ id }: { id: string }, value: { count: number; resetAt: number }) => {
            stored[id] = value;
          },
        }),
    });
  });

  it('allows calls up to the limit, then answers 429 with Retry-After', async () => {
    expect(await checkVerifiedUidLimit('u1', limit)).toBeNull();
    expect(await checkVerifiedUidLimit('u1', limit)).toBeNull();

    const refused = await checkVerifiedUidLimit('u1', limit);

    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('Retry-After')).toBeTruthy();
  });

  it('counts each verified uid separately', async () => {
    await checkVerifiedUidLimit('u1', limit);
    await checkVerifiedUidLimit('u1', limit);

    expect(await checkVerifiedUidLimit('u2', limit)).toBeNull();
    expect(docId).toHaveBeenCalledWith('test--u2');
  });

  it('lets the call through when Firestore fails: the in-memory limit still applies', async () => {
    (getFirestoreAdmin as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({}) }),
      runTransaction: async () => {
        throw new Error('firestore down');
      },
    });

    expect(await checkVerifiedUidLimit('u1', limit)).toBeNull();
  });

  it('defines a limit for both OpenAI routes', () => {
    expect(AI_UID_RATE_LIMIT.feedback.maxRequests).toBeGreaterThan(0);
    expect(AI_UID_RATE_LIMIT.rewriteComment.maxRequests).toBeGreaterThan(0);
  });
});
