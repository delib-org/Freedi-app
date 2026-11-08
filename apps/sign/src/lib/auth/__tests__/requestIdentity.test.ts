/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { verifyAuthHeader, verifySessionCookieValue } from '@/lib/firebase/admin';
import { checkAdminAccess, checkDocumentAccess } from '@/lib/utils/adminAccess';
import {
  canAccessDocument,
  getParticipantId,
  getParticipantIdentity,
  getVerifiedUserId,
  isVerifiedDocumentAdmin,
  ParticipantIdentity,
} from '../requestIdentity';

jest.mock('@/lib/firebase/admin', () => ({
  verifyAuthHeader: jest.fn(),
  verifySessionCookieValue: jest.fn(),
}));
jest.mock('@/lib/utils/adminAccess', () => ({
  checkAdminAccess: jest.fn(),
  checkDocumentAccess: jest.fn(),
}));

const ADMIN_UID = 'real-admin-uid';
const ANON_ID = 'anon_1700000000000_abc123def';

const mockVerifyHeader = verifyAuthHeader as jest.Mock;
const mockVerifySession = verifySessionCookieValue as jest.Mock;
const mockAdminAccess = checkAdminAccess as jest.Mock;
const mockDocumentAccess = checkDocumentAccess as jest.Mock;

function requestWith(cookie: string): NextRequest {
  return new NextRequest('http://localhost/api/x', { headers: { cookie } });
}

function dbWith(signSettings: Record<string, unknown> | undefined): Firestore {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ signSettings }) }),
      }),
    }),
  } as unknown as Firestore;
}

const google: ParticipantIdentity = {
  uid: 'google-uid',
  email: 'a@b.c',
  displayName: 'A',
  isAnonymous: false,
  verified: true,
};
const anonymousVisitor: ParticipantIdentity = {
  uid: ANON_ID,
  email: null,
  displayName: null,
  isAnonymous: true,
  verified: false,
};

describe('requestIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyHeader.mockResolvedValue(null);
    mockVerifySession.mockResolvedValue(null);
  });

  describe('a forged cookie', () => {
    it("cannot reach admin paths with an admin's uid in _uid", async () => {
      expect(await getVerifiedUserId(requestWith(`_uid=${ADMIN_UID}`))).toBeNull();
    });

    it('cannot reach admin paths with an admin uid in the legacy userId cookie', async () => {
      expect(await getVerifiedUserId(requestWith(`userId=${ADMIN_UID}`))).toBeNull();
    });

    it('is not accepted as a participant unless it is a server-minted anon id', async () => {
      expect(await getParticipantId(requestWith(`_uid=${ADMIN_UID}`))).toBeNull();
    });

    it('cannot reach admin paths even with a well-formed anon id', async () => {
      expect(await getVerifiedUserId(requestWith(`_uid=${ANON_ID}`))).toBeNull();
    });
  });

  describe('verified identity', () => {
    it('accepts a valid session cookie and checks revocation on admin paths', async () => {
      mockVerifySession.mockResolvedValue({ ...google, uid: ADMIN_UID });

      expect(await getVerifiedUserId(requestWith('__session=signed'))).toBe(ADMIN_UID);
      expect(mockVerifySession).toHaveBeenCalledWith('signed', true);
    });

    it('prefers the session over a conflicting _uid cookie', async () => {
      mockVerifySession.mockResolvedValue({ ...google, uid: ADMIN_UID });
      const identity = await getParticipantIdentity(requestWith(`__session=s; _uid=${ANON_ID}`));

      expect(identity).toMatchObject({ uid: ADMIN_UID, verified: true });
    });

    it('verifies once per request however many helpers ask', async () => {
      mockVerifySession.mockResolvedValue(google);
      const request = requestWith('__session=s');

      await getParticipantId(request);
      await getParticipantIdentity(request);

      expect(mockVerifySession).toHaveBeenCalledTimes(1);
    });
  });

  describe('server-minted anonymous visitors', () => {
    it('are participants, unverified', async () => {
      expect(await getParticipantIdentity(requestWith(`_uid=${ANON_ID}`))).toEqual(anonymousVisitor);
    });

    it('never reach checkAdminAccess', async () => {
      expect(await isVerifiedDocumentAdmin(dbWith({}), 'doc', anonymousVisitor)).toBe(false);
      expect(mockAdminAccess).not.toHaveBeenCalled();
    });
  });

  describe('canAccessDocument', () => {
    const privateDoc = { isPublic: false };

    it('lets anyone use a public document', async () => {
      expect(await canAccessDocument(dbWith({ isPublic: true }), 'doc', null)).toBe(true);
    });

    it('treats a document with no settings as public', async () => {
      expect(await canAccessDocument(dbWith(undefined), 'doc', anonymousVisitor)).toBe(true);
    });

    it('refuses an anonymous visitor on a private document', async () => {
      expect(await canAccessDocument(dbWith(privateDoc), 'doc', anonymousVisitor)).toBe(false);
    });

    it('refuses a Firebase-anonymous user on a private document', async () => {
      const firebaseAnon = { ...google, isAnonymous: true };

      expect(await canAccessDocument(dbWith(privateDoc), 'doc', firebaseAnon)).toBe(false);
      expect(mockDocumentAccess).not.toHaveBeenCalled();
    });

    it('refuses a signed-in non-member on a private document', async () => {
      mockDocumentAccess.mockResolvedValue(false);

      expect(await canAccessDocument(dbWith(privateDoc), 'doc', google)).toBe(false);
    });

    it('admits a signed-in member of a private document', async () => {
      mockDocumentAccess.mockResolvedValue(true);

      expect(await canAccessDocument(dbWith(privateDoc), 'doc', google)).toBe(true);
    });

    it('limits a hidden document to admins', async () => {
      mockAdminAccess.mockResolvedValue({ isAdmin: false });
      mockDocumentAccess.mockResolvedValue(true);

      expect(await canAccessDocument(dbWith({ isHidden: true }), 'doc', google)).toBe(false);
    });
  });
});
