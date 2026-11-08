/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { getAuthAdmin, verifyAuthHeader } from '@/lib/firebase/admin';
import { DELETE, POST } from '../../../../app/api/auth/session/route';
import { POST as clearSession } from '../../../../app/api/auth/clear-session/route';

jest.mock('@/lib/firebase/admin', () => ({
  verifyAuthHeader: jest.fn(),
  verifySessionCookieValue: jest.fn(),
  getAuthAdmin: jest.fn(),
}));
jest.mock('@/lib/utils/adminAccess', () => ({
  checkAdminAccess: jest.fn(),
  checkDocumentAccess: jest.fn(),
}));

const createSessionCookie = jest.fn();
const mockVerify = verifyAuthHeader as jest.Mock;

function expiredCookieNames(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((header) => /max-age=0/i.test(header))
    .map((header) => header.split('=')[0]);
}

function sessionPost(headers: Record<string, string>, body?: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/session', { method: 'POST', headers, body });
}

describe('session routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthAdmin as jest.Mock).mockReturnValue({ createSessionCookie });
    createSessionCookie.mockResolvedValue('signed-session');
    mockVerify.mockResolvedValue({ uid: 'u1', email: null, displayName: null, isAnonymous: false });
  });

  it.each([
    ['sign-out', () => DELETE()],
    ['clear-session', () => clearSession()],
  ])('%s expires the session cookie and _uid', async (_name, call) => {
    expect(expiredCookieNames(await call())).toEqual(
      expect.arrayContaining(['__session', '_uid', 'sessionUid', 'userId', 'userDisplayName'])
    );
  });

  it('sets an HttpOnly session and a readable marker together', async () => {
    const response = await POST(sessionPost({ authorization: 'Bearer good' }));
    const cookies = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(createSessionCookie).toHaveBeenCalledWith('good', expect.anything());
    expect(cookies.find((c) => c.startsWith('__session='))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('sessionUid='))).not.toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('sessionUid='))).toContain('sessionUid=u1');
  });

  it('refuses a token that does not verify', async () => {
    mockVerify.mockResolvedValue(null);

    const response = await POST(sessionPost({ authorization: 'Bearer forged' }));

    expect(response.status).toBe(401);
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('ignores a token in the body, which a cross-site form could send', async () => {
    mockVerify.mockResolvedValue(null);

    const response = await POST(sessionPost({}, JSON.stringify({ idToken: 'attacker' })));

    expect(response.status).toBe(401);
    expect(mockVerify).toHaveBeenCalledWith(null);
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('reports failure without setting a cookie when Firebase refuses', async () => {
    createSessionCookie.mockRejectedValue(new Error('no permission'));

    const response = await POST(sessionPost({ authorization: 'Bearer good' }));

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
