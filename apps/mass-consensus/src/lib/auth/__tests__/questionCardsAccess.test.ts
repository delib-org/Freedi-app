/**
 * Who may manage a question's cards and put pictures on them. The property that matters: a
 * survey role only counts for questions that really belong to that survey.
 */

jest.mock('@/lib/firebase/surveys', () => ({
  getSurveyById: jest.fn(),
}));

jest.mock('../verifyAdmin', () => ({
  isAdminOfStatement: jest.fn(),
}));

jest.mock('../surveyAccess', () => ({
  resolveSurveyAccess: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
  logError: jest.fn(),
}));

import { Statement, Survey, buildSurveyAccess } from '@freedi/shared-types';
import { canEditCardImage, canEditQuestionCards } from '../questionCardsAccess';
import { getSurveyById } from '@/lib/firebase/surveys';
import { isAdminOfStatement } from '../verifyAdmin';
import { resolveSurveyAccess } from '../surveyAccess';
import { logError } from '@/lib/utils/errorHandling';

const option = { statementId: 'opt-1', parentId: 'q-1' } as Statement;
const survey = { surveyId: 's-1', creatorId: 'owner', questionIds: ['q-1'] } as Survey;

const mockIsAdmin = isAdminOfStatement as jest.Mock;
const mockGetSurvey = getSurveyById as jest.Mock;
const mockResolve = resolveSurveyAccess as jest.Mock;

describe('canEditQuestionCards / canEditCardImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdmin.mockResolvedValue(false);
    mockGetSurvey.mockResolvedValue(survey);
    mockResolve.mockResolvedValue(null);
  });

  it('allows an admin of the question, without looking at any survey', async () => {
    mockIsAdmin.mockResolvedValue(true);

    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(true);
    expect(mockIsAdmin).toHaveBeenCalledWith('u', 'q-1');
    expect(mockGetSurvey).not.toHaveBeenCalled();
  });

  it('refuses a non-admin when there is no survey', async () => {
    await expect(canEditCardImage('u', option)).resolves.toBe(false);
    await expect(canEditCardImage('u', option, null)).resolves.toBe(false);
  });

  it('allows a survey owner or editor', async () => {
    mockResolve.mockResolvedValue(buildSurveyAccess('owner'));
    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(true);

    mockResolve.mockResolvedValue(buildSurveyAccess('editor'));
    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(true);
  });

  it('refuses a survey viewer and a stranger', async () => {
    mockResolve.mockResolvedValue(buildSurveyAccess('viewer'));
    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(false);

    mockResolve.mockResolvedValue(null);
    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(false);
  });

  it('refuses an editor of a survey the question is not part of', async () => {
    mockGetSurvey.mockResolvedValue({ ...survey, questionIds: ['other-q'] });
    mockResolve.mockResolvedValue(buildSurveyAccess('owner'));

    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(false);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('refuses when the survey does not exist', async () => {
    mockGetSurvey.mockResolvedValue(null);

    await expect(canEditCardImage('u', option, 'missing')).resolves.toBe(false);
  });

  it('checks a question directly by its id', async () => {
    mockIsAdmin.mockResolvedValue(true);

    await expect(canEditQuestionCards('u', 'q-9')).resolves.toBe(true);
    expect(mockIsAdmin).toHaveBeenCalledWith('u', 'q-9');
  });

  it('fails closed and logs when the lookup throws', async () => {
    mockGetSurvey.mockRejectedValue(new Error('firestore down'));

    await expect(canEditCardImage('u', option, 's-1')).resolves.toBe(false);
    expect(logError).toHaveBeenCalled();
  });
});
