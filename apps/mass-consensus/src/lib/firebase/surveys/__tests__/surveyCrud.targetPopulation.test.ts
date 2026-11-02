const mockSet = jest.fn().mockResolvedValue(undefined);
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockCascade = jest.fn().mockResolvedValue({ updated: 0, skipped: 0, refused: 0 });

jest.mock('@/lib/firebase/admin', () => ({
	getFirestoreAdmin: () => ({
		collection: () => ({ doc: () => ({ set: mockSet, update: mockUpdate, get: mockGet }) }),
	}),
}));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => 'FIELD_DELETE' } }));
jest.mock('@/lib/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../cascadeTargetPopulation', () => ({ cascadeTargetPopulation: (...a: unknown[]) => mockCascade(...a) }));
jest.mock('../../synthesis/cascadeSynthesisToggle', () => ({ cascadeSynthesisToggle: jest.fn() }));
jest.mock('../cascadeAutoAiHandling', () => ({ cascadeAutoAiHandling: jest.fn() }));
jest.mock('../cascadeMinResponseWords', () => ({ cascadeMinResponseWords: jest.fn() }));
jest.mock('../cascadeRatingMode', () => ({ cascadeRatingMode: jest.fn() }));

import { createSurvey, updateSurvey } from '../surveyCrud';
import { DEFAULT_SURVEY_SETTINGS } from '@/types/survey';

function existing(targetPopulation?: number): void {
	mockGet.mockResolvedValue({
		exists: true,
		data: () => ({
			surveyId: 's1',
			title: 'T',
			questionIds: ['q1'],
			settings: { ...DEFAULT_SURVEY_SETTINGS, ...(targetPopulation ? { targetPopulation } : {}) },
		}),
	});
}

describe('surveyCrud - number of stakeholders', () => {
	beforeEach(() => jest.clearAllMocks());

	it('create stores nothing when the field is empty (0) and does not cascade', async () => {
		const survey = await createSurvey('u', {
			title: 'T',
			settings: { ...DEFAULT_SURVEY_SETTINGS, targetPopulation: 0 },
		});

		expect('targetPopulation' in survey.settings).toBe(false);
		expect(mockCascade).not.toHaveBeenCalled();
	});

	it('create stores a number and cascades it to the questions it starts with', async () => {
		const survey = await createSurvey('u', {
			title: 'T',
			questionIds: ['q1'],
			settings: { ...DEFAULT_SURVEY_SETTINGS, targetPopulation: 300 },
		});

		expect(survey.settings.targetPopulation).toBe(300);
		expect(mockCascade).toHaveBeenCalledWith(
			expect.objectContaining({ questionIds: ['q1'], addedQuestionIds: ['q1'] }),
		);
	});

	it('update with the clear signal (0) removes the key and runs the clear cascade', async () => {
		existing(300);

		const merged = await updateSurvey('s1', {
			settings: { ...DEFAULT_SURVEY_SETTINGS, targetPopulation: 0 },
		});

		expect(merged?.settings && 'targetPopulation' in merged.settings).toBe(false);
		const written = mockUpdate.mock.calls[0][0] as { settings: Record<string, unknown> };
		expect('targetPopulation' in written.settings).toBe(false);
		expect(mockCascade).toHaveBeenCalledWith(
			expect.objectContaining({ change: { previous: 300, next: undefined } }),
		);
	});

	it('an autosave that leaves the number as it was does not run the cascade', async () => {
		existing(300);

		await updateSurvey('s1', { settings: { ...DEFAULT_SURVEY_SETTINGS, targetPopulation: 300 } });

		expect(mockCascade).not.toHaveBeenCalled();
	});

	it('a question added to the survey is passed as added', async () => {
		existing(300);

		await updateSurvey('s1', { questionIds: ['q1', 'q2'] });

		expect(mockCascade).toHaveBeenCalledWith(
			expect.objectContaining({ addedQuestionIds: ['q2'] }),
		);
	});

	it('tells the caller how many questions the number could not be set on', async () => {
		existing(100);
		mockCascade.mockResolvedValueOnce({ updated: 1, skipped: 0, refused: 2 });

		const saved = await updateSurvey('s1', { settings: { ...DEFAULT_SURVEY_SETTINGS, targetPopulation: 300 } });

		expect(saved?.targetPopulationSkipped).toBe(2);
		expect(mockCascade).toHaveBeenCalledWith(
			expect.objectContaining({ survey: expect.objectContaining({ surveyId: 's1' }) }),
		);
	});

	it('an unchanged autosave reads no question and no roster (the cascade is not even called)', async () => {
		existing(300);

		await updateSurvey('s1', { settings: { ...DEFAULT_SURVEY_SETTINGS, targetPopulation: 300 } });

		expect(mockCascade).not.toHaveBeenCalled();
	});
});
