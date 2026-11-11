/**
 * The survey routes against a real surveyCrud and an in-memory Firestore: only
 * the cascades are replaced, so "no cascade call" is observed where it counts.
 */

type Doc = Record<string, unknown>;

/** "collection/id" -> document data; a missing key is a missing document. */
const store = new Map<string, Doc>();
const mockVerifyToken = jest.fn();
const mockSynthesis = jest.fn().mockResolvedValue({});
const mockAutoAi = jest.fn().mockResolvedValue({});
const mockMinWords = jest.fn().mockResolvedValue({});
const mockRating = jest.fn().mockResolvedValue({});
const mockPopulation = jest.fn().mockResolvedValue({ updated: 0, skipped: 0, refused: 0 });

function mockDocRef(name: string, id: string): Doc {
  const key = `${name}/${id}`;

  return {
    id,
    get: async () => ({ exists: store.has(key), data: () => store.get(key) }),
    set: async (data: Doc) => {
      store.set(key, data);
    },
    update: async (data: Doc) => {
      store.set(key, { ...store.get(key), ...data });
    },
  };
}

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: (name: string) => ({
      doc: (id: string) => mockDocRef(name, id),
      where: (_field: string, _op: string, surveyId: string) => ({
        limit: () => ({
          get: async () => ({
            docs: [...store.entries()]
              .filter(([key, doc]) => key.startsWith(`${name}/`) && doc.surveyId === surveyId)
              .map(([, doc]) => ({ data: () => doc })),
          }),
        }),
      }),
    }),
    batch: () => ({ update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }),
  }),
}));

jest.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => 'FIELD_DELETE' } }));
jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/utils/errorHandling', () => ({
  ...jest.requireActual('@/lib/utils/errorHandling'),
  logError: jest.fn(),
}));
jest.mock('@/lib/utils/rateLimit', () => ({
  checkRateLimit: () => null,
  RATE_LIMITS: { ADMIN: {} },
}));
jest.mock('@/lib/auth/verifyAdmin', () => ({
  extractBearerToken: (header: string | null) => header?.replace('Bearer ', '') ?? null,
  verifyToken: (token: string) => mockVerifyToken(token),
  isAdminOfStatement: jest.fn(),
}));
jest.mock('@/lib/firebase/synthesis/cascadeSynthesisToggle', () => ({
  cascadeSynthesisToggle: (...args: unknown[]) => mockSynthesis(...args),
}));
jest.mock('@/lib/firebase/surveys/cascadeAutoAiHandling', () => ({
  cascadeAutoAiHandling: (...args: unknown[]) => mockAutoAi(...args),
}));
jest.mock('@/lib/firebase/surveys/cascadeMinResponseWords', () => ({
  cascadeMinResponseWords: (...args: unknown[]) => mockMinWords(...args),
}));
jest.mock('@/lib/firebase/surveys/cascadeRatingMode', () => ({
  cascadeRatingMode: (...args: unknown[]) => mockRating(...args),
}));
jest.mock('@/lib/firebase/surveys/cascadeTargetPopulation', () => ({
  cascadeTargetPopulation: (...args: unknown[]) => mockPopulation(...args),
}));

import { NextRequest } from 'next/server';
import { SurveyAdminRole } from '@freedi/shared-types';
import { SURVEY_QUESTIONS } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';
import { POST as createSurveyRoute } from '../../../../app/api/surveys/route';
import { PUT as updateSurveyRoute } from '../../../../app/api/surveys/[id]/route';
import { PUT as addQuestionRoute } from '../../../../app/api/surveys/[id]/questions/route';

const OWNER = 'owner';
const EDITOR = 'editor';
const VIEWER = 'viewer';
const STRANGER = 'stranger';
const SURVEY_ID = 'survey-1';
const CONTEXT = { params: { id: SURVEY_ID } };
const SURVEY_KEY = `surveys/${SURVEY_ID}`;
const ALL_CASCADES = [mockSynthesis, mockAutoAi, mockMinWords, mockRating, mockPopulation];

function question(id: string, creatorId: string, extra: Doc = {}): void {
  store.set(`statements/${id}`, {
    statementId: id,
    creatorId,
    topParentId: id,
    statementType: 'question',
    ...extra,
  });
}

function surveyDoc(questionIds: string[]): void {
  store.set(SURVEY_KEY, {
    surveyId: SURVEY_ID,
    creatorId: OWNER,
    title: 'Survey',
    questionIds,
    settings: {},
    questionSettings: {},
  });
}

function coAdmin(userId: string, role: SurveyAdminRole): void {
  store.set(`surveyAdmins/${SURVEY_ID}--${userId}`, { surveyId: SURVEY_ID, userId, role });
}

function request(url: string, method: string, body: Doc): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  });
}

const signedInAs = (uid: string): void => {
  mockVerifyToken.mockResolvedValue(uid);
};
const create = (body: Doc): Promise<Response> =>
  createSurveyRoute(request('/api/surveys', 'POST', { title: 'New', ...body }));
const update = (body: Doc): Promise<Response> =>
  updateSurveyRoute(request(`/api/surveys/${SURVEY_ID}`, 'PUT', body), CONTEXT);
const addQuestion = (questionId: unknown): Promise<Response> =>
  addQuestionRoute(request(`/api/surveys/${SURVEY_ID}/questions`, 'PUT', { questionId }), CONTEXT);

function expectNoCascade(): void {
  ALL_CASCADES.forEach((cascade) => expect(cascade).not.toHaveBeenCalled());
}

function savedQuestionIds(): unknown {
  return store.get(SURVEY_KEY)?.questionIds;
}

function savedSurveys(): string[] {
  return [...store.keys()].filter((key) => key.startsWith('surveys/'));
}

describe('survey routes: rights over the questions a survey names', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.clear();
    question('own', OWNER);
    question('own-2', OWNER);
    question('editors', EDITOR);
    question('foreign', STRANGER);
    signedInAs(OWNER);
  });

  describe('POST /api/surveys', () => {
    it('rejects the whole request and cascades nothing when one question is foreign', async () => {
      const response = await create({ questionIds: ['own', 'foreign'] });

      expect(response.status).toBe(403);
      expect(savedSurveys()).toEqual([]);
      expectNoCascade();
    });

    it('answers a question that does not exist exactly like a foreign one', async () => {
      const foreign = await create({ questionIds: ['foreign'] });
      const missing = await create({ questionIds: ['no-such-question'] });

      expect(missing.status).toBe(403);
      expect(await missing.json()).toEqual(await foreign.json());
      expectNoCascade();
    });

    it('logs the refusal with context', async () => {
      await create({ questionIds: ['own', 'foreign'] });

      expect(logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          userId: OWNER,
          metadata: expect.objectContaining({ questionIds: ['foreign'] }),
        })
      );
    });

    it('accepts questions the caller created', async () => {
      const response = await create({ questionIds: ['own', 'own-2'] });

      expect(response.status).toBe(201);
      expect(savedSurveys()).toHaveLength(1);
      expect(mockSynthesis).toHaveBeenCalledTimes(1);
    });

    it('accepts a question the caller administers through a subscription', async () => {
      store.set(`statementsSubscribe/${OWNER}--foreign`, { role: 'admin' });

      const response = await create({ questionIds: ['foreign'] });

      expect(response.status).toBe(201);
    });

    it('accepts a question the caller administers through its top parent', async () => {
      question('child', STRANGER, { topParentId: 'group' });
      store.set(`statementsSubscribe/${OWNER}--group`, { role: 'admin' });

      const response = await create({ questionIds: ['child'] });

      expect(response.status).toBe(201);
    });

    it('accepts a survey with no questions', async () => {
      const response = await create({});

      expect(response.status).toBe(201);
    });

    it.each([
      ['a string', 'own'],
      ['a list holding a non-string', ['own', 7]],
      ['an id that is really a path', ['a/b/c']],
      ['an empty id', ['']],
    ])('refuses %s with 400', async (_label, questionIds) => {
      const response = await create({ questionIds });

      expect(response.status).toBe(400);
      expectNoCascade();
    });

    it('refuses more ids than it will check', async () => {
      const questionIds = Array.from(
        { length: SURVEY_QUESTIONS.MAX_IDS_CHECKED_PER_REQUEST + 1 },
        (_, i) => `q${i}`
      );

      const response = await create({ questionIds });

      expect(response.status).toBe(400);
      expectNoCascade();
    });
  });

  describe('PUT /api/surveys/[id]', () => {
    it('rejects a newly added foreign question, leaving survey and questions untouched', async () => {
      surveyDoc(['own']);

      const response = await update({ questionIds: ['own', 'foreign'], title: 'Changed' });

      expect(response.status).toBe(403);
      expect(savedQuestionIds()).toEqual(['own']);
      expect(store.get(SURVEY_KEY)?.title).toBe('Survey');
      expectNoCascade();
    });

    it('lets the owner add their own question', async () => {
      surveyDoc(['own']);

      const response = await update({ questionIds: ['own', 'own-2'] });

      expect(response.status).toBe(200);
      expect(savedQuestionIds()).toEqual(['own', 'own-2']);
      expect(mockSynthesis).toHaveBeenCalledTimes(1);
    });

    it('lets a co-admin re-save a survey holding a question only the owner administers', async () => {
      surveyDoc(['own']);
      coAdmin(EDITOR, SurveyAdminRole.editor);
      signedInAs(EDITOR);

      const response = await update({ questionIds: ['own'], title: 'Edited' });

      expect(response.status).toBe(200);
      expect(store.get(SURVEY_KEY)?.title).toBe('Edited');
    });

    it('lets a co-admin add a question they administer', async () => {
      surveyDoc(['own']);
      coAdmin(EDITOR, SurveyAdminRole.editor);
      signedInAs(EDITOR);

      const response = await update({ questionIds: ['own', 'editors'] });

      expect(response.status).toBe(200);
      expect(savedQuestionIds()).toEqual(['own', 'editors']);
    });

    it('lets a co-admin restore a question the owner administers (a stale form)', async () => {
      surveyDoc([]);
      coAdmin(EDITOR, SurveyAdminRole.editor);
      signedInAs(EDITOR);

      const response = await update({ questionIds: ['own'] });

      expect(response.status).toBe(200);
    });

    it('rejects a co-admin adding a question nobody running the survey administers', async () => {
      surveyDoc(['own']);
      coAdmin(EDITOR, SurveyAdminRole.editor);
      signedInAs(EDITOR);

      const response = await update({ questionIds: ['own', 'foreign'] });

      expect(response.status).toBe(403);
      expectNoCascade();
    });

    it('does not count a viewer as someone running the survey', async () => {
      surveyDoc(['own']);
      coAdmin(VIEWER, SurveyAdminRole.viewer);
      store.set(`statementsSubscribe/${VIEWER}--foreign`, { role: 'admin' });

      const response = await update({ questionIds: ['own', 'foreign'] });

      expect(response.status).toBe(403);
      expectNoCascade();
    });

    it('keeps a survey editable when it already holds a question nobody on it administers', async () => {
      surveyDoc(['own', 'foreign']);

      const response = await update({ questionIds: ['foreign', 'own'], title: 'Edited' });

      expect(response.status).toBe(200);
      expect(store.get(SURVEY_KEY)?.title).toBe('Edited');
    });

    it('still rejects a new foreign question on a survey that already holds one', async () => {
      surveyDoc(['foreign']);
      question('foreign-2', STRANGER);

      const response = await update({ questionIds: ['foreign', 'foreign-2'] });

      expect(response.status).toBe(403);
      expectNoCascade();
    });

    it('lets the owner remove questions', async () => {
      surveyDoc(['own', 'foreign']);

      const response = await update({ questionIds: ['own'] });

      expect(response.status).toBe(200);
      expect(savedQuestionIds()).toEqual(['own']);
    });

    it('saves a body with no question list without checking any question', async () => {
      surveyDoc(['own', 'foreign']);

      const response = await update({ title: 'Edited' });

      expect(response.status).toBe(200);
      expect(logError).not.toHaveBeenCalled();
    });

    it('refuses a malformed list with 400 and stores nothing', async () => {
      surveyDoc(['own']);

      const response = await update({ questionIds: null });

      expect(response.status).toBe(400);
      expect(savedQuestionIds()).toEqual(['own']);
      expectNoCascade();
    });

    it('still refuses someone with no access to the survey', async () => {
      surveyDoc(['own']);
      signedInAs(STRANGER);

      const response = await update({ questionIds: ['own', 'foreign'] });

      expect(response.status).toBe(404);
      expectNoCascade();
    });
  });

  describe('PUT /api/surveys/[id]/questions', () => {
    it('rejects adding a foreign question and cascades nothing', async () => {
      surveyDoc(['own']);

      const response = await addQuestion('foreign');

      expect(response.status).toBe(403);
      expect(savedQuestionIds()).toEqual(['own']);
      expectNoCascade();
    });

    it('adds a question the caller administers', async () => {
      surveyDoc(['own']);

      const response = await addQuestion('own-2');

      expect(response.status).toBe(200);
      expect(savedQuestionIds()).toEqual(['own', 'own-2']);
    });

    it('lets a co-admin add a question they administer', async () => {
      surveyDoc(['own']);
      coAdmin(EDITOR, SurveyAdminRole.editor);
      signedInAs(EDITOR);

      const response = await addQuestion('editors');

      expect(response.status).toBe(200);
      expect(savedQuestionIds()).toEqual(['own', 'editors']);
    });

    it('treats a question the survey already holds as a no-op, not a refusal', async () => {
      surveyDoc(['foreign']);

      const response = await addQuestion('foreign');

      expect(response.status).toBe(200);
      expect(savedQuestionIds()).toEqual(['foreign']);
      expectNoCascade();
    });

    it('refuses an id that is really a path', async () => {
      surveyDoc(['own']);

      const response = await addQuestion('a/b/c');

      expect(response.status).toBe(400);
    });
  });
});
