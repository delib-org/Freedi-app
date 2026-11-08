/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { verifyAuthHeader, verifySessionCookieValue, getFirestoreAdmin } from '@/lib/firebase/admin';
import { checkAdminAccess, checkDocumentAccess } from '@/lib/utils/adminAccess';
import { getDocumentForSigning } from '@/lib/firebase/queries';
import { POST as addParagraph } from '../../../../app/api/admin/paragraphs/route';
import { GET as getDocument } from '../../../../app/api/documents/[statementId]/route';
import { middleware } from '../../../../middleware';

jest.mock('@/lib/firebase/admin', () => ({
  verifyAuthHeader: jest.fn(),
  verifySessionCookieValue: jest.fn(),
  getFirestoreAdmin: jest.fn(),
}));
jest.mock('@/lib/utils/adminAccess', () => ({
  checkAdminAccess: jest.fn(),
  checkDocumentAccess: jest.fn(),
}));
jest.mock('@/lib/firebase/queries', () => ({
  getDocumentForSigning: jest.fn(),
  getParagraphsFromStatement: jest.fn(() => []),
}));

const mockHeader = verifyAuthHeader as jest.Mock;
const mockSession = verifySessionCookieValue as jest.Mock;
const mockDb = getFirestoreAdmin as jest.Mock;
const mockAdmin = checkAdminAccess as jest.Mock;
const mockMember = checkDocumentAccess as jest.Mock;
const mockDocument = getDocumentForSigning as jest.Mock;

const ADMIN_UID = 'real-admin-uid';
const set = jest.fn();

function fakeDb(data: Record<string, unknown>): void {
  const docRef = {
    get: async () => ({ exists: true, data: () => data }),
    set,
  };
  mockDb.mockReturnValue({
    collection: () => ({
      doc: () => docRef,
      where: () => ({ where: () => ({ get: async () => ({ size: 0 }) }) }),
    }),
  });
}

function paragraphRequest(cookie: string): NextRequest {
  return new NextRequest('http://localhost/api/admin/paragraphs', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ documentId: 'doc', content: 'text', type: 'paragraph' }),
  });
}

function documentRequest(cookie: string): NextRequest {
  return new NextRequest('http://localhost/api/documents/doc', { headers: { cookie } });
}

const routeParams = { params: Promise.resolve({ statementId: 'doc' }) };
const signedIn = { uid: 'u1', email: 'a@b.c', displayName: 'A', isAnonymous: false };

describe('Sign protected routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeader.mockResolvedValue(null);
    mockSession.mockResolvedValue(null);
    fakeDb({ creator: {} });
  });

  describe('POST /api/admin/paragraphs', () => {
    it("refuses a forged _uid holding an admin's uid", async () => {
      const response = await addParagraph(paragraphRequest(`_uid=${ADMIN_UID}`));

      expect(response.status).toBe(401);
      expect(mockAdmin).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('refuses a signed-in user who is not an admin of the document', async () => {
      mockSession.mockResolvedValue(signedIn);
      mockAdmin.mockResolvedValue({ isAdmin: false, isViewer: false });

      const response = await addParagraph(paragraphRequest('__session=s'));

      expect(response.status).toBe(403);
      expect(set).not.toHaveBeenCalled();
    });

    it('refuses a viewer', async () => {
      mockSession.mockResolvedValue(signedIn);
      mockAdmin.mockResolvedValue({ isAdmin: true, isViewer: true });

      const response = await addParagraph(paragraphRequest('__session=s'));

      expect(response.status).toBe(403);
    });

    it('lets a verified document admin add a paragraph', async () => {
      mockSession.mockResolvedValue(signedIn);
      mockAdmin.mockResolvedValue({ isAdmin: true, isViewer: false });

      const response = await addParagraph(paragraphRequest('__session=s'));

      expect(response.status).toBe(200);
      expect(mockAdmin).toHaveBeenCalledWith(expect.anything(), 'doc', signedIn.uid);
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/documents/[statementId] on a private document', () => {
    beforeEach(() => {
      fakeDb({ signSettings: { isPublic: false } });
      mockDocument.mockResolvedValue({ statement: 'secret' });
    });

    it('refuses a server-minted anonymous visitor', async () => {
      const response = await getDocument(
        documentRequest('_uid=anon_1700000000000_abc123def'),
        routeParams
      );

      expect(response.status).toBe(401);
      expect(mockDocument).not.toHaveBeenCalled();
    });

    it('refuses a signed-in non-member', async () => {
      mockSession.mockResolvedValue(signedIn);
      mockMember.mockResolvedValue(false);

      const response = await getDocument(documentRequest('__session=s'), routeParams);

      expect(response.status).toBe(403);
      expect(mockDocument).not.toHaveBeenCalled();
    });

    it('returns the document to a member', async () => {
      mockSession.mockResolvedValue(signedIn);
      mockMember.mockResolvedValue(true);

      const response = await getDocument(documentRequest('__session=s'), routeParams);

      expect(response.status).toBe(200);
    });
  });

  describe('middleware', () => {
    function uidCookieAfter(cookie: string): string | undefined {
      const request = new NextRequest('http://localhost/', { headers: { cookie } });

      return middleware(request).cookies.get('_uid')?.value;
    }

    it('never copies the JS-writable userId cookie into _uid', () => {
      const uid = uidCookieAfter(`userId=${ADMIN_UID}`);

      expect(uid).toBeDefined();
      expect(uid).not.toBe(ADMIN_UID);
      expect(uid).toMatch(/^anon_/);
    });

    it('replaces a _uid left over from the old copy', () => {
      expect(uidCookieAfter(`_uid=${ADMIN_UID}; userId=${ADMIN_UID}`)).toMatch(/^anon_/);
    });

    it('leaves a server-minted anon id alone', () => {
      expect(uidCookieAfter('_uid=anon_1700000000000_abc123def')).toBeUndefined();
    });
  });
});
