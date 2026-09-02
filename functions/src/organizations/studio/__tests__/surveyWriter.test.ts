import { SurveyStatus, type Statement } from '@freedi/shared-types';

jest.mock('../../../db', () => {
	const { createFakeDb } = jest.requireActual('../../__tests__/fakeFirestore');

	return { db: createFakeDb() };
});

import { buildSurveyForActivity, surveyStatusForQuestionStatus } from '../surveyWriter';

const activity = {
	statementId: 'act-1',
	statement: 'Which ideas should we fund?',
	description: 'Rate the ideas',
} as Statement;
const extra = { statementId: 'act-1-q2', statement: 'Anything else?' } as Statement;

describe('surveyWriter', () => {
	it('maps run states to MC survey statuses', () => {
		expect(surveyStatusForQuestionStatus('live')).toBe(SurveyStatus.active);
		expect(surveyStatusForQuestionStatus(undefined)).toBe(SurveyStatus.active);
		expect(surveyStatusForQuestionStatus('frozen')).toBe(SurveyStatus.draft);
		expect(surveyStatusForQuestionStatus('closed')).toBe(SurveyStatus.closed);
	});

	it('builds a survey shaped like MC createSurvey', () => {
		const survey = buildSurveyForActivity({
			surveyId: 'survey_x',
			activity,
			extraQuestions: [extra],
			config: {
				intro: 'Welcome!',
				explanationPages: [{ title: 'Why', content: 'Because' }],
				allowParticipantsToAddSuggestions: false,
				minEvaluationsPerQuestion: 5,
			},
			parentStatementId: 'top-1',
			creatorId: 'alice',
			language: 'he',
			status: SurveyStatus.active,
			now: 1000,
		});
		expect(survey.surveyId).toBe('survey_x');
		expect(survey.questionIds).toEqual(['act-1', 'act-1-q2']);
		expect(survey.settings.allowParticipantsToAddSuggestions).toBe(false);
		expect(survey.settings.minEvaluationsPerQuestion).toBe(5);
		expect(survey.settings.allowReturning).toBe(true);
		expect(survey.customIntroText).toBe('Welcome!');
		expect(survey.showIntro).toBe(true);
		expect(survey.explanationPages?.[0]).toMatchObject({
			title: 'Why',
			content: 'Because',
			position: 0,
		});
		expect(survey.parentStatementId).toBe('top-1');
		expect(survey.defaultLanguage).toBe('he');
		expect(survey.status).toBe('active');
	});

	it('falls back to defaults without config', () => {
		const survey = buildSurveyForActivity({
			activity,
			extraQuestions: [],
			config: undefined,
			parentStatementId: 'top-1',
			creatorId: 'alice',
			language: 'en',
			status: SurveyStatus.draft,
			now: 1000,
		});
		expect(survey.surveyId.startsWith('survey_')).toBe(true);
		expect(survey.settings.minEvaluationsPerQuestion).toBe(3);
		expect(survey.customIntroText).toBeUndefined();
		expect(survey.explanationPages).toBeUndefined();
	});
});
