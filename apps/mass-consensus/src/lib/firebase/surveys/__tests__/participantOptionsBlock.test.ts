// Mock Firebase admin before importing the module under test
const mockGet = jest.fn();
const mockWhere = jest.fn().mockReturnValue({ get: mockGet });
const mockCollection = jest.fn().mockReturnValue({ where: mockWhere });

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: mockCollection,
  }),
}));

const mockLogError = jest.fn();
jest.mock('@/lib/utils/errorHandling', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}));

import { isAddBlockedForQuestion } from '../participantOptionsBlock';

const QUESTION_ID = 'q-1';

function surveyDoc(data: Record<string, unknown>) {
  return { data: () => data };
}

function resolveSurveys(docs: Array<{ data: () => Record<string, unknown> }>) {
  mockGet.mockResolvedValue({ docs });
}

describe('isAddBlockedForQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries the surveys that carry the question', async () => {
    resolveSurveys([]);

    await isAddBlockedForQuestion(QUESTION_ID);

    expect(mockCollection).toHaveBeenCalledWith('surveys');
    expect(mockWhere).toHaveBeenCalledWith('questionIds', 'array-contains', QUESTION_ID);
  });

  it('is true when the one survey blocks the question', async () => {
    resolveSurveys([
      surveyDoc({
        questionIds: [QUESTION_ID],
        questionSettings: { [QUESTION_ID]: { blockParticipantOptions: true } },
      }),
    ]);

    await expect(isAddBlockedForQuestion(QUESTION_ID)).resolves.toBe(true);
  });

  it('is true when any of several surveys blocks the question', async () => {
    resolveSurveys([
      surveyDoc({
        questionIds: [QUESTION_ID],
        settings: { allowParticipantsToAddSuggestions: true },
        questionSettings: {},
      }),
      surveyDoc({
        questionIds: [QUESTION_ID],
        questionSettings: { [QUESTION_ID]: { blockParticipantOptions: true } },
      }),
    ]);

    await expect(isAddBlockedForQuestion(QUESTION_ID)).resolves.toBe(true);
  });

  it('is false when no survey blocks it (absent, false, or another question blocked)', async () => {
    resolveSurveys([
      surveyDoc({ questionIds: [QUESTION_ID] }),
      surveyDoc({
        questionIds: [QUESTION_ID],
        questionSettings: { [QUESTION_ID]: { blockParticipantOptions: false } },
      }),
      surveyDoc({
        questionIds: [QUESTION_ID, 'q-2'],
        questionSettings: { 'q-2': { blockParticipantOptions: true } },
      }),
    ]);

    await expect(isAddBlockedForQuestion(QUESTION_ID)).resolves.toBe(false);
  });

  it('is false when the question is in no survey', async () => {
    resolveSurveys([]);

    await expect(isAddBlockedForQuestion(QUESTION_ID)).resolves.toBe(false);
  });

  it('fails open on a lookup error and logs it with context', async () => {
    const failure = new Error('firestore down');
    mockGet.mockRejectedValue(failure);

    await expect(isAddBlockedForQuestion(QUESTION_ID)).resolves.toBe(false);
    expect(mockLogError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        operation: 'participantOptionsBlock.isAddBlockedForQuestion',
        questionId: QUESTION_ID,
      }),
    );
  });
});
