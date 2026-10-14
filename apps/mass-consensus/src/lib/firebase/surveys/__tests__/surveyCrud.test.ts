/**
 * Survey CRUD Tests - Email signup fields and the completion message
 * Tests that the new showEmailSignup, customEmailTitle, customEmailDescription
 * fields are properly handled in createSurvey and updateSurvey
 */

// Mock Firebase admin before importing
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockDoc = jest.fn().mockReturnValue({
  set: mockSet,
  update: mockUpdate,
  get: mockGet,
});
const mockCollection = jest.fn().mockReturnValue({
  doc: mockDoc,
});

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: mockCollection,
  }),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => 'FIELD_DELETE' },
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { createSurvey, updateSurvey } from '../surveyCrud';
import { DEFAULT_SURVEY_SETTINGS } from '@/types/survey';

describe('surveyCrud - email signup fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSurvey', () => {
    it('should create a survey without email signup fields when not provided', async () => {
      const result = await createSurvey('user-1', {
        title: 'Test Survey',
      });

      expect(result.title).toBe('Test Survey');
      expect(result.showEmailSignup).toBeUndefined();
      expect(result.customEmailTitle).toBeUndefined();
      expect(result.customEmailDescription).toBeUndefined();
      expect(mockSet).toHaveBeenCalledTimes(1);
    });

    it('should create a survey with showEmailSignup=false', async () => {
      const result = await createSurvey('user-1', {
        title: 'Test Survey',
        showEmailSignup: false,
      });

      expect(result.showEmailSignup).toBe(false);
      expect(mockSet).toHaveBeenCalledTimes(1);
      const savedData = mockSet.mock.calls[0][0];
      expect(savedData.showEmailSignup).toBe(false);
    });

    it('should create a survey with custom email title and description', async () => {
      const result = await createSurvey('user-1', {
        title: 'Test Survey',
        showEmailSignup: true,
        customEmailTitle: 'Get Notified',
        customEmailDescription: 'We will send you the results',
      });

      expect(result.showEmailSignup).toBe(true);
      expect(result.customEmailTitle).toBe('Get Notified');
      expect(result.customEmailDescription).toBe('We will send you the results');

      const savedData = mockSet.mock.calls[0][0];
      expect(savedData.customEmailTitle).toBe('Get Notified');
      expect(savedData.customEmailDescription).toBe('We will send you the results');
    });
  });

  describe('updateSurvey', () => {
    const existingSurvey = {
      surveyId: 'survey-1',
      title: 'Existing Survey',
      description: '',
      creatorId: 'user-1',
      questionIds: ['q-1'],
      settings: DEFAULT_SURVEY_SETTINGS,
      status: 'active' as const,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    };

    beforeEach(() => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => existingSurvey,
      });
    });

    it('should update showEmailSignup field', async () => {
      const result = await updateSurvey('survey-1', {
        showEmailSignup: false,
      });

      expect(result).not.toBeNull();
      expect(result!.showEmailSignup).toBe(false);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const updateData = mockUpdate.mock.calls[0][0];
      expect(updateData.showEmailSignup).toBe(false);
    });

    it('should update customEmailTitle field', async () => {
      const result = await updateSurvey('survey-1', {
        customEmailTitle: 'New Title',
      });

      expect(result).not.toBeNull();
      expect(result!.customEmailTitle).toBe('New Title');
      const updateData = mockUpdate.mock.calls[0][0];
      expect(updateData.customEmailTitle).toBe('New Title');
    });

    it('should update customEmailDescription field', async () => {
      const result = await updateSurvey('survey-1', {
        customEmailDescription: 'New Description',
      });

      expect(result).not.toBeNull();
      expect(result!.customEmailDescription).toBe('New Description');
      const updateData = mockUpdate.mock.calls[0][0];
      expect(updateData.customEmailDescription).toBe('New Description');
    });

    it('should update all three email fields together', async () => {
      const result = await updateSurvey('survey-1', {
        showEmailSignup: true,
        customEmailTitle: 'Stay in Touch',
        customEmailDescription: 'Subscribe for updates',
      });

      expect(result).not.toBeNull();
      const updateData = mockUpdate.mock.calls[0][0];
      expect(updateData.showEmailSignup).toBe(true);
      expect(updateData.customEmailTitle).toBe('Stay in Touch');
      expect(updateData.customEmailDescription).toBe('Subscribe for updates');
    });

    it('should not include email fields when not provided in update', async () => {
      await updateSurvey('survey-1', {
        title: 'Updated Title',
      });

      const updateData = mockUpdate.mock.calls[0][0];
      expect(updateData.title).toBe('Updated Title');
      expect(updateData).not.toHaveProperty('showEmailSignup');
      expect(updateData).not.toHaveProperty('customEmailTitle');
      expect(updateData).not.toHaveProperty('customEmailDescription');
    });

    it('should return null when survey not found', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      const result = await updateSurvey('nonexistent', {
        showEmailSignup: false,
      });

      expect(result).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('completionMessage', () => {
    const message = {
      explanationPageId: 'completion-message',
      title: 'Thanks',
      content: '## Thank you!',
      position: -1,
    };
    const existingSurvey = {
      surveyId: 'survey-1',
      title: 'Existing Survey',
      description: '',
      creatorId: 'user-1',
      questionIds: ['q-1'],
      settings: DEFAULT_SURVEY_SETTINGS,
      status: 'active' as const,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      completionMessage: message,
    };

    beforeEach(() => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => existingSurvey,
      });
    });

    it('saves a completion message on create', async () => {
      const result = await createSurvey('user-1', { title: 'T', completionMessage: message });

      expect(result.completionMessage).toEqual(message);
      expect(mockSet.mock.calls[0][0].completionMessage).toEqual(message);
    });

    it('leaves the field out on create when there is none', async () => {
      await createSurvey('user-1', { title: 'T', completionMessage: null });

      expect(mockSet.mock.calls[0][0]).not.toHaveProperty('completionMessage');
    });

    it('updates the completion message', async () => {
      const edited = { ...message, content: 'See you soon' };
      const result = await updateSurvey('survey-1', { completionMessage: edited });

      expect(mockUpdate.mock.calls[0][0].completionMessage).toEqual(edited);
      expect(result!.completionMessage).toEqual(edited);
    });

    it('deletes the field when the message is removed (null)', async () => {
      const result = await updateSurvey('survey-1', { completionMessage: null });

      expect(mockUpdate.mock.calls[0][0].completionMessage).toBe('FIELD_DELETE');
      expect(result).not.toHaveProperty('completionMessage');
    });

    it('does not touch the message when the update omits it', async () => {
      const result = await updateSurvey('survey-1', { title: 'Renamed' });

      expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('completionMessage');
      expect(result!.completionMessage).toEqual(message);
    });
  });
});
