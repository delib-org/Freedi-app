/**
 * Token verification reporting.
 *
 * The admin API sits on the public internet, so scanners and expired tabs both
 * arrive with tokens that cannot be decoded. Those are answered with a 401 and
 * must NOT reach Sentry; a broken deployment still must.
 */

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

jest.mock('@/lib/firebase/admin', () => ({
  initializeFirebaseAdmin: jest.fn(),
  getFirestoreAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
  logError: jest.fn(),
}));

import { verifyIdentity, verifyToken } from '../verifyAdmin';
import { logError } from '@/lib/utils/errorHandling';

/** A firebase-admin FirebaseAuthError carries a prefixed `code`. */
function authError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe('verifyToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Keep the expected-path console.info out of the test output.
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('returns the uid for a valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });

    await expect(verifyToken('good-token')).resolves.toBe('user-1');
    expect(logError).not.toHaveBeenCalled();
  });

  it('does not report a token that cannot be decoded', async () => {
    // The exact error behind the "Decoding Firebase ID token failed" and
    // 'no "kid" claim' issues: a probe with a junk Authorization header.
    mockVerifyIdToken.mockRejectedValue(
      authError('auth/argument-error', 'Decoding Firebase ID token failed.')
    );

    await expect(verifyToken('nonsense')).resolves.toBeNull();
    expect(logError).not.toHaveBeenCalled();
  });

  it('does not report an expired token', async () => {
    mockVerifyIdToken.mockRejectedValue(
      authError('auth/id-token-expired', 'The provided Firebase ID token is expired.')
    );

    await expect(verifyToken('stale')).resolves.toBeNull();
    expect(logError).not.toHaveBeenCalled();
  });

  it('reports a failure that means this deployment is broken', async () => {
    mockVerifyIdToken.mockRejectedValue(
      authError('auth/internal-error', 'Error fetching public keys')
    );

    await expect(verifyToken('good-token')).resolves.toBeNull();
    expect(logError).toHaveBeenCalledWith(expect.any(Error), {
      operation: 'verifyAdmin.verifyToken',
    });
  });

  it('reports an error with no Firebase code at all', async () => {
    mockVerifyIdToken.mockRejectedValue(new TypeError('auth is not a function'));

    await expect(verifyToken('good-token')).resolves.toBeNull();
    expect(logError).toHaveBeenCalled();
  });
});

describe('verifyIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('lowercases the email claim', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user-1',
      email: '  Admin@Example.COM ',
      name: ' Tal ',
    });

    await expect(verifyIdentity('good-token')).resolves.toEqual({
      userId: 'user-1',
      email: 'admin@example.com',
      displayName: 'Tal',
    });
  });

  it('does not report a rejected token', async () => {
    mockVerifyIdToken.mockRejectedValue(
      authError('auth/argument-error', 'Decoding Firebase ID token failed.')
    );

    await expect(verifyIdentity('nonsense')).resolves.toBeNull();
    expect(logError).not.toHaveBeenCalled();
  });
});
