import { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { upsertEvaluation } from '@/lib/firebase/evaluations/evaluationWrites';
import { postToCloudFunction } from '@/lib/api/cloudFunction';
import { getAddOptionRefusal } from '@/lib/firebase/addOptionGuard';
import { GET, POST } from '../../../../app/api/evaluations/[id]/route';
import { POST as merge } from '../../../../app/api/statements/[id]/merge/route';

jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));
jest.mock('@/lib/firebase/admin', () => ({
  initializeFirebaseAdmin: jest.fn(),
  getFirestoreAdmin: jest.fn(),
}));
jest.mock('@/lib/firebase/evaluations/evaluationWrites', () => ({ upsertEvaluation: jest.fn() }));
jest.mock('@/lib/firebase/surveys', () => ({
  getSurveyById: jest.fn(),
  getStatementIdForSurvey: jest.fn(),
}));
jest.mock('@/lib/utils/researchLogger', () => ({ logResearchAction: jest.fn() }));
jest.mock('@/lib/api/cloudFunction', () => ({ postToCloudFunction: jest.fn() }));
jest.mock('@/lib/firebase/addOptionGuard', () => ({ getAddOptionRefusal: jest.fn() }));

const VICTIM_UID = 'victim-uid';
const CALLER_UID = 'caller-uid';

const verifyIdToken = jest.fn();
const statementRead = jest.fn();

function evaluationRequest(body: Record<string, unknown>, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/evaluations/s1', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 's1' }) };

describe('MC participant identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuth as jest.Mock).mockReturnValue({ verifyIdToken });
    verifyIdToken.mockResolvedValue({ uid: CALLER_UID });
    statementRead.mockResolvedValue({
      exists: true,
      data: () => ({ parentId: 'q1', topParentId: 'q1' }),
    });
    (getFirestoreAdmin as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({ get: statementRead }) }),
    });
    (upsertEvaluation as jest.Mock).mockResolvedValue({ evaluationId: 'e1' });
    (getAddOptionRefusal as jest.Mock).mockResolvedValue(null);
  });

  describe('POST /api/evaluations/[id]', () => {
    it('refuses a request without a token, even with a userId in the body', async () => {
      const response = await POST(evaluationRequest({ evaluation: 1, userId: VICTIM_UID }, {}), context);

      expect(response.status).toBe(401);
      expect(upsertEvaluation).not.toHaveBeenCalled();
    });

    it('ignores a cookie identity', async () => {
      const response = await POST(
        evaluationRequest({ evaluation: 1 }, { cookie: `_uid=${VICTIM_UID}` }),
        context
      );

      expect(response.status).toBe(401);
    });

    it('saves under the verified uid and ignores the body userId and userName', async () => {
      const response = await POST(
        evaluationRequest(
          { evaluation: 1, userId: VICTIM_UID, userName: 'Victim' },
          { authorization: 'Bearer good' }
        ),
        context
      );

      expect(response.status).toBe(200);
      const saved = (upsertEvaluation as jest.Mock).mock.calls[0][1];
      expect(saved.userId).toBe(CALLER_UID);
      expect(saved.displayName).not.toBe('Victim');
    });

    it('verifies locally, without a revocation round trip', async () => {
      await POST(evaluationRequest({ evaluation: 1 }, { authorization: 'Bearer good' }), context);

      expect(verifyIdToken).toHaveBeenCalledWith('good');
    });

    it('adds no Firestore read to the vote path', async () => {
      await POST(evaluationRequest({ evaluation: 1 }, { authorization: 'Bearer good' }), context);

      // The statement and its parent, exactly what the route read before this change.
      expect(statementRead).toHaveBeenCalledTimes(2);
    });

    it('lets an anonymous Firebase user vote', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'anon-firebase-uid', firebase: { sign_in_provider: 'anonymous' } });

      const response = await POST(
        evaluationRequest({ evaluation: -1 }, { authorization: 'Bearer anon' }),
        context
      );

      expect(response.status).toBe(200);
      expect((upsertEvaluation as jest.Mock).mock.calls[0][1].userId).toBe('anon-firebase-uid');
    });
  });

  describe('GET /api/evaluations/[id]', () => {
    it("does not return another user's evaluation for a userId in the query", async () => {
      const request = new NextRequest(`http://localhost/api/evaluations/s1?userId=${VICTIM_UID}`);
      const response = await GET(request, context);

      expect(await response.json()).toEqual({ evaluation: null });
      expect(statementRead).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/statements/[id]/merge', () => {
    const body = {
      targetStatementId: 't1',
      solutionText: 'a meaningful idea with several real words',
      userId: VICTIM_UID,
      userName: 'Victim',
    };

    function mergeRequest(headers: Record<string, string>): NextRequest {
      return new NextRequest('http://localhost/api/statements/q1/merge', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    beforeEach(() => {
      process.env.MERGE_STATEMENTS_ENDPOINT = 'https://functions.example/merge';
      (postToCloudFunction as jest.Mock).mockResolvedValue({
        kind: 'json',
        status: 200,
        ok: true,
        data: {},
      });
    });

    it('refuses a request without a token', async () => {
      const response = await merge(mergeRequest({}), { params: Promise.resolve({ id: 'q1' }) });

      expect(response.status).toBe(401);
      expect(postToCloudFunction).not.toHaveBeenCalled();
    });

    it('sends the verified uid and forwards the caller token to the function', async () => {
      await merge(mergeRequest({ authorization: 'Bearer good' }), { params: Promise.resolve({ id: 'q1' }) });

      const [, payload, options] = (postToCloudFunction as jest.Mock).mock.calls[0];
      expect(payload.userId).toBe(CALLER_UID);
      expect(payload.userName).not.toBe('Victim');
      expect(options).toEqual({ authorization: 'Bearer good' });
    });
  });
});
