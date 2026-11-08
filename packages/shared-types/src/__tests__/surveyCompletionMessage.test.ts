/**
 * Tests for Survey.completionMessage - optional, explanation-page shaped
 */

// setupTests mocks valibot for every suite; this one needs the real parser.
jest.unmock('valibot');

import { safeParse } from 'valibot';
import { SurveySchema, DEFAULT_SURVEY_SETTINGS } from '../models/survey/surveyModel';

const baseSurvey = {
	surveyId: 'survey_1',
	title: 'Budget',
	creatorId: 'user_1',
	questionIds: ['q1'],
	settings: DEFAULT_SURVEY_SETTINGS,
	status: 'active',
	createdAt: 1,
	lastUpdate: 1,
};

describe('SurveySchema completionMessage', () => {
	it('parses a survey saved before the field existed', () => {
		const result = safeParse(SurveySchema, baseSurvey);

		expect(result.success).toBe(true);
		expect(result.success && result.output.completionMessage).toBeUndefined();
	});

	it('keeps a completion message shaped like an explanation page', () => {
		const completionMessage = {
			explanationPageId: 'completion-message',
			title: 'Thanks',
			content: '## Thank you',
			position: -1,
			heroImageUrl: 'https://example.com/a.png',
		};
		const result = safeParse(SurveySchema, { ...baseSurvey, completionMessage });

		expect(result.success).toBe(true);
		expect(result.success && result.output.completionMessage).toEqual(completionMessage);
	});

	it('rejects a completion message without content', () => {
		const result = safeParse(SurveySchema, {
			...baseSurvey,
			completionMessage: { explanationPageId: 'x', title: 't', position: -1 },
		});

		expect(result.success).toBe(false);
	});
});
