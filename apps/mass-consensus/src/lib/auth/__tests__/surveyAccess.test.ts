/**
 * Survey access resolution — the gate every survey admin endpoint goes
 * through. These tests pin the two properties that matter for security:
 * a viewer can never edit, and an unknown user is never granted anything.
 */

const mockAdminGet = jest.fn();
const mockDoc = jest.fn().mockReturnValue({ get: mockAdminGet });
const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({ collection: mockCollection }),
}));

jest.mock('@/lib/firebase/surveys', () => ({
  getSurveyById: jest.fn(),
}));

jest.mock('@/lib/auth/verifyAdmin', () => ({
  verifyToken: jest.fn(),
  extractBearerToken: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
  logError: jest.fn(),
}));

import { Survey, SurveyAdminRole } from '@freedi/shared-types';
import { NextRequest } from 'next/server';
import {
  denySurveyPermission,
  requireSurveyAccess,
  resolveSurveyAccess,
} from '../surveyAccess';
import { getSurveyById } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';

const survey = { surveyId: 'survey-1', creatorId: 'owner-1', title: 'A survey' } as Survey;

/** Make the surveyAdmins lookup return a record with `role`, or nothing. */
function mockAdminRecord(role: SurveyAdminRole | null): void {
  mockAdminGet.mockResolvedValue(
    role === null
      ? { exists: false, data: () => undefined }
      : {
          exists: true,
          data: () => ({
            surveyAdminId: `survey-1--user-2`,
            surveyId: 'survey-1',
            userId: 'user-2',
            email: 'invited@example.com',
            displayName: 'Invited',
            role,
            addedBy: 'owner-1',
            addedAt: 1,
            lastUpdate: 1,
          }),
        }
  );
}

describe('resolveSurveyAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gives the creator owner access without reading the roster', async () => {
    const access = await resolveSurveyAccess(survey, 'owner-1');

    expect(access).toEqual({ level: 'owner', canEdit: true, canManageAdmins: true });
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it('gives an admin-edit record edit access but not admin management', async () => {
    mockAdminRecord(SurveyAdminRole.editor);

    const access = await resolveSurveyAccess(survey, 'user-2');

    expect(access).toEqual({ level: 'editor', canEdit: true, canManageAdmins: false });
  });

  it('gives an admin-viewer record view access only', async () => {
    mockAdminRecord(SurveyAdminRole.viewer);

    const access = await resolveSurveyAccess(survey, 'user-2');

    expect(access).toEqual({ level: 'viewer', canEdit: false, canManageAdmins: false });
  });

  it('returns null for a user with no record', async () => {
    mockAdminRecord(null);

    expect(await resolveSurveyAccess(survey, 'stranger')).toBeNull();
  });

  it('fails closed when the roster read throws', async () => {
    mockAdminGet.mockRejectedValue(new Error('firestore unavailable'));

    expect(await resolveSurveyAccess(survey, 'user-2')).toBeNull();
  });
});

describe('denySurveyPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a viewer to view', async () => {
    mockAdminRecord(SurveyAdminRole.viewer);

    expect(await denySurveyPermission(survey, 'user-2', 'view')).toBeNull();
  });

  it('refuses a viewer an edit with 403', async () => {
    mockAdminRecord(SurveyAdminRole.viewer);

    const denied = await denySurveyPermission(survey, 'user-2', 'edit');

    expect(denied?.status).toBe(403);
  });

  it('allows an editor to edit', async () => {
    mockAdminRecord(SurveyAdminRole.editor);

    expect(await denySurveyPermission(survey, 'user-2', 'edit')).toBeNull();
  });

  it('refuses an editor the admin list with 403', async () => {
    mockAdminRecord(SurveyAdminRole.editor);

    const denied = await denySurveyPermission(survey, 'user-2', 'manageAdmins');

    expect(denied?.status).toBe(403);
  });

  it('lets the owner manage admins', async () => {
    expect(await denySurveyPermission(survey, 'owner-1', 'manageAdmins')).toBeNull();
  });

  it('answers 404, not 403, for a user with no access at all', async () => {
    mockAdminRecord(null);

    const denied = await denySurveyPermission(survey, 'stranger', 'view');

    // A 403 would confirm the survey exists to someone who cannot see it.
    expect(denied?.status).toBe(404);
  });
});

describe('requireSurveyAccess', () => {
  const request = {
    headers: { get: () => 'Bearer token-abc' },
  } as unknown as NextRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    (extractBearerToken as jest.Mock).mockReturnValue('token-abc');
    (verifyToken as jest.Mock).mockResolvedValue('user-2');
    (getSurveyById as jest.Mock).mockResolvedValue(survey);
  });

  it('401s when there is no bearer token', async () => {
    (extractBearerToken as jest.Mock).mockReturnValue(null);

    const result = await requireSurveyAccess(request, 'survey-1', 'view');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.response.status).toBe(401);
  });

  it('401s when the token does not verify', async () => {
    (verifyToken as jest.Mock).mockResolvedValue(null);

    const result = await requireSurveyAccess(request, 'survey-1', 'view');

    expect(result.ok === false && result.response.status).toBe(401);
  });

  it('404s when the survey does not exist', async () => {
    (getSurveyById as jest.Mock).mockResolvedValue(null);

    const result = await requireSurveyAccess(request, 'survey-1', 'view');

    expect(result.ok === false && result.response.status).toBe(404);
  });

  it('returns the survey and access on success', async () => {
    mockAdminRecord(SurveyAdminRole.editor);

    const result = await requireSurveyAccess(request, 'survey-1', 'edit');

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.access.canEdit).toBe(true);
    expect(result.ok === true && result.survey.surveyId).toBe('survey-1');
    expect(result.ok === true && result.userId).toBe('user-2');
  });
});
