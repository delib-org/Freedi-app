/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import {
  getFirestoreAdmin,
  getFirebaseAdmin,
  verifyAuthHeader,
  verifySessionCookieValue,
} from '@/lib/firebase/admin';
import { checkAdminAccess, checkDocumentAccess } from '@/lib/utils/adminAccess';
import { POST as upload } from '../../../../app/api/admin/upload/route';
import { POST as importGoogleDoc } from '../../../../app/api/import/google-docs/route';
import { GET as getComments } from '../../../../app/api/comments/[paragraphId]/route';
import { GET as getSuggestions } from '../../../../app/api/suggestions/[paragraphId]/route';
import { GET as getSignature } from '../../../../app/api/signatures/[docId]/route';
import { GET as getEvaluations } from '../../../../app/api/evaluations/[commentId]/route';
import { GET as getApproval } from '../../../../app/api/approvals/[paragraphId]/route';
import { GET as getQuestions } from '../../../../app/api/demographics/questions/[docId]/route';

jest.mock('@/lib/firebase/admin', () => ({
  verifyAuthHeader: jest.fn(),
  verifySessionCookieValue: jest.fn(),
  getFirestoreAdmin: jest.fn(),
  getFirebaseAdmin: jest.fn(),
  uploadBufferToStorage: jest.fn(),
  uploadImageFromUrl: jest.fn(),
}));
jest.mock('@/lib/utils/adminAccess', () => ({
  checkAdminAccess: jest.fn(),
  checkDocumentAccess: jest.fn(),
}));
jest.mock('@/lib/google-docs/client', () => ({
  fetchGoogleDoc: jest.fn(),
  getServiceAccountEmail: jest.fn(),
}));
jest.mock('@/lib/google-docs/converter', () => ({
  convertGoogleDocsToParagraphs: jest.fn(),
  getDocumentTitle: jest.fn(),
}));
jest.mock('@/lib/firebase/demographicQueries', () => ({
  getDemographicQuestions: jest.fn(async () => []),
  getAllQuestionsForDocument: jest.fn(),
  saveDemographicQuestion: jest.fn(),
  getDemographicName: jest.fn(),
}));

const ADMIN_UID = 'real-admin-uid';
const ANON_ID = 'anon_1700000000000_abc123def';
const PRIVATE_DOC = 'private-doc';
const PUBLIC_DOC = 'public-doc';
const member = { uid: 'member', email: 'm@x.y', displayName: 'M', isAnonymous: false };

const documents: Record<string, Record<string, unknown>> = {
  [PRIVATE_DOC]: { signSettings: { isPublic: false } },
  [PUBLIC_DOC]: { signSettings: { isPublic: true } },
  'private-comment': { topParentId: PRIVATE_DOC },
};
let queryRows: Array<Record<string, unknown>> = [];
let ownRow: Record<string, unknown> | null = null;
const documentReads = jest.fn();

function fakeDb(): unknown {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: queryRows.map((row) => ({ data: () => row })) }),
  };

  return {
    collection: (name: string) => ({
      ...query,
      doc: (id: string) => ({
        get: async () => {
          if (name === 'statements') {
            documentReads(id);

            return { exists: Boolean(documents[id]), data: () => documents[id] };
          }

          return { exists: ownRow !== null, data: () => ownRow };
        },
      }),
    }),
  };
}

function get(path: string, cookie = ''): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers: { cookie } });
}

const anonymous = `_uid=${ANON_ID}`;
const paragraph = { params: Promise.resolve({ paragraphId: 'p1' }) };
const privateDocParam = { params: Promise.resolve({ docId: PRIVATE_DOC }) };
const publicDocParam = { params: Promise.resolve({ docId: PUBLIC_DOC }) };
const privateComment = { params: Promise.resolve({ commentId: 'private-comment' }) };

function rowsOn(documentId: string): Array<Record<string, unknown>> {
  return [{ statementId: 'c1', statement: 'text', topParentId: documentId, documentId }];
}

describe('Sign routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryRows = [];
    ownRow = null;
    (verifyAuthHeader as jest.Mock).mockResolvedValue(null);
    (verifySessionCookieValue as jest.Mock).mockResolvedValue(null);
    (getFirestoreAdmin as jest.Mock).mockImplementation(fakeDb);
    (getFirebaseAdmin as jest.Mock).mockImplementation(() => ({ db: fakeDb() }));
    (checkDocumentAccess as jest.Mock).mockResolvedValue(false);
    (checkAdminAccess as jest.Mock).mockResolvedValue({ isAdmin: false });
  });

  describe('a forged cookie on the admin upload and import routes', () => {
    it("is refused on upload, even with an admin's uid", async () => {
      const request = new NextRequest('http://localhost/api/admin/upload', {
        method: 'POST',
        headers: { cookie: `userId=${ADMIN_UID}; _uid=${ADMIN_UID}` },
      });

      const response = await upload(request);

      expect(response.status).toBe(401);
      expect(checkAdminAccess).not.toHaveBeenCalled();
    });

    it("is refused on Google Docs import, even with an admin's uid", async () => {
      const request = new NextRequest('http://localhost/api/import/google-docs', {
        method: 'POST',
        headers: { cookie: `userId=${ADMIN_UID}; _uid=${ADMIN_UID}` },
        body: JSON.stringify({ documentUrl: 'https://docs.google.com/document/d/x', statementId: 'd' }),
      });

      const response = await importGoogleDoc(request);

      expect(response.status).toBe(401);
      expect(checkAdminAccess).not.toHaveBeenCalled();
    });
  });

  describe('list reads', () => {
    it('hides comments on a private document from an anonymous visitor', async () => {
      queryRows = rowsOn(PRIVATE_DOC);
      const body = await (await getComments(get('/api/comments/p1', anonymous), paragraph)).json();

      expect(body.comments).toEqual([]);
    });

    it('shows comments on a private document to a member', async () => {
      queryRows = rowsOn(PRIVATE_DOC);
      (verifySessionCookieValue as jest.Mock).mockResolvedValue(member);
      (checkDocumentAccess as jest.Mock).mockResolvedValue(true);

      const body = await (await getComments(get('/api/comments/p1', '__session=s'), paragraph)).json();

      expect(body.comments).toHaveLength(1);
    });

    it('keeps comments on a public document open to anonymous visitors', async () => {
      queryRows = rowsOn(PUBLIC_DOC);
      const body = await (await getComments(get('/api/comments/p1', anonymous), paragraph)).json();

      expect(body.comments).toHaveLength(1);
    });

    it('does not let one comment pointing at a public document unlock the others', async () => {
      queryRows = [...rowsOn(PUBLIC_DOC), ...rowsOn(PRIVATE_DOC)];
      const body = await (await getComments(get('/api/comments/p1', anonymous), paragraph)).json();

      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].documentId).toBe(PUBLIC_DOC);
    });

    it('makes no extra lookup for an empty list', async () => {
      await getComments(get('/api/comments/p1', anonymous), paragraph);

      expect(documentReads).not.toHaveBeenCalled();
    });

    it('hides suggestions on a private document from an anonymous visitor', async () => {
      queryRows = rowsOn(PRIVATE_DOC);
      const body = await (await getSuggestions(get('/api/suggestions/p1', anonymous), paragraph)).json();

      expect(body.suggestions).toEqual([]);
    });

    it('keeps suggestions on a public document open', async () => {
      queryRows = rowsOn(PUBLIC_DOC);
      const body = await (await getSuggestions(get('/api/suggestions/p1'), paragraph)).json();

      expect(body.suggestions).toHaveLength(1);
    });
  });

  describe('single reads', () => {
    it('refuses the signature read on a private document for an anonymous visitor', async () => {
      const response = await getSignature(get(`/api/signatures/${PRIVATE_DOC}`, anonymous), privateDocParam);

      expect(response.status).toBe(401);
    });

    it('still gives an anonymous visitor their signature on a public document', async () => {
      ownRow = { signed: 'signed' };
      const response = await getSignature(get(`/api/signatures/${PUBLIC_DOC}`, anonymous), publicDocParam);

      expect(response.status).toBe(200);
      expect((await response.json()).signature).toEqual({ signed: 'signed' });
    });

    it('refuses evaluation totals on a private document for a signed-in non-member', async () => {
      (verifySessionCookieValue as jest.Mock).mockResolvedValue(member);

      const response = await getEvaluations(get('/api/evaluations/private-comment', '__session=s'), privateComment);

      expect(response.status).toBe(403);
    });

    it('withholds an approval on a private document', async () => {
      ownRow = { approval: true, documentId: PRIVATE_DOC };
      const body = await (await getApproval(get('/api/approvals/p1', anonymous), paragraph)).json();

      expect(body.approval).toBeNull();
    });

    it('returns an approval on a public document', async () => {
      ownRow = { approval: true, documentId: PUBLIC_DOC };
      const body = await (await getApproval(get('/api/approvals/p1', anonymous), paragraph)).json();

      expect(body.approval).toEqual(ownRow);
    });

    it('refuses demographic questions on a private document', async () => {
      const response = await getQuestions(get(`/api/demographics/questions/${PRIVATE_DOC}`, anonymous), privateDocParam);

      expect(response.status).toBe(401);
    });

    it('serves demographic questions on a public document with no extra read', async () => {
      const response = await getQuestions(get(`/api/demographics/questions/${PUBLIC_DOC}`, anonymous), publicDocParam);

      expect(response.status).toBe(200);
      expect(documentReads).toHaveBeenCalledTimes(1);
    });
  });
});
