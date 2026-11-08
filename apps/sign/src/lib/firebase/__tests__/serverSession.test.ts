import type { User } from 'firebase/auth';
import { establishServerSession } from '../serverSession';

jest.mock('@/lib/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockFetch = jest.fn();

function userWith(uid: string): User {
  return { uid, getIdToken: async () => `token-${uid}` } as unknown as User;
}

function setMarker(uid: string): void {
  document.cookie = `sessionUid=${uid}; path=/`;
}

function clearMarker(): void {
  document.cookie = 'sessionUid=; path=/; max-age=0';
}

/** A server that answers OK and whose Set-Cookie the browser stores. */
function serverStoresSessionFor(uid: string): void {
  mockFetch.mockImplementation(async () => {
    setMarker(uid);

    return { ok: true };
  });
}

describe('establishServerSession', () => {
  beforeEach(() => {
    clearMarker();
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('creates a session and sends the token in a header', async () => {
    serverStoresSessionFor('a');

    expect(await establishServerSession(userWith('a'))).toBe('created');
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-a' },
    });
  });

  it('does nothing when this user already has one', async () => {
    setMarker('a');

    expect(await establishServerSession(userWith('a'))).toBe('existing');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates a new session when the account changes', async () => {
    setMarker('a');
    serverStoresSessionFor('b');

    expect(await establishServerSession(userWith('b'))).toBe('created');
  });

  it('settles after an account switch, so a page that reloads on created stops', async () => {
    setMarker('a');
    serverStoresSessionFor('b');

    expect(await establishServerSession(userWith('b'))).toBe('created');
    expect(await establishServerSession(userWith('b'))).toBe('existing');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports failure when the browser did not store the cookie, to avoid a reload loop', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    expect(await establishServerSession(userWith('a'))).toBe('failed');
  });

  it('reports failure when the server refuses', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    expect(await establishServerSession(userWith('a'))).toBe('failed');
  });

  it('reports failure on a network error', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    expect(await establishServerSession(userWith('a'))).toBe('failed');
  });

  it('shares one request between concurrent callers', async () => {
    serverStoresSessionFor('a');
    const user = userWith('a');

    await Promise.all([establishServerSession(user), establishServerSession(user)]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('lets an explicit sign-in replace a session the marker claims exists', async () => {
    setMarker('a');
    serverStoresSessionFor('a');

    expect(await establishServerSession(userWith('a'), { force: true })).toBe('created');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
