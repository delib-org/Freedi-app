import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { OrganizationActivity } from '@freedi/shared-types';

const useQuestionProgressByIds = vi.fn();
const useSurveyStats = vi.fn();
vi.mock('@/db/orgActivities', () => ({
	useQuestionProgressByIds: (...args: unknown[]) => useQuestionProgressByIds(...args),
	useSurveyStats: (...args: unknown[]) => useSurveyStats(...args),
}));

import LinkedSurveyCard from '../components/LinkedSurveyCard';

const ACTIVITY: OrganizationActivity = {
	activityId: 'org-1--q-one',
	organizationId: 'org-1',
	statementId: 'q-one',
	statementTitle: 'The first question',
	addedBy: 'alice',
	addedByDisplayName: 'Alice',
	addedAt: 1,
	lastUpdate: 1,
	surveyId: 'survey_1712345678901_a1b2c3d',
	surveyTitle: 'Transport survey',
	surveyQuestionIds: ['q-one', 'q-two'],
};

function progress(statementId: string, entered: number, suggested: number, evaluated: number) {
	return {
		statementId,
		topParentId: statementId,
		entered,
		suggested,
		evaluated,
		options: 0,
		evaluations: 0,
		lastActivity: 0,
		lastUpdate: 0,
	};
}

function renderCard(activity: OrganizationActivity = ACTIVITY) {
	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<LinkedSurveyCard activity={activity} />
		</TranslationProvider>,
	);
}

describe('LinkedSurveyCard', () => {
	beforeEach(() => {
		useSurveyStats.mockReset();
		useSurveyStats.mockReturnValue({});
		useQuestionProgressByIds.mockReset();
		useQuestionProgressByIds.mockReturnValue({
			data: {
				'q-one': progress('q-one', 10, 4, 2),
				'q-two': progress('q-two', 5, 1, 1),
			},
			loading: false,
			error: null,
		});
	});
	afterEach(cleanup);

	it("shows the survey's own title", () => {
		renderCard();

		expect(screen.getByText('Transport survey')).toBeTruthy();
	});

	it('counts the questions the survey covers', () => {
		renderCard();

		expect(screen.getByText(/2 questions/i)).toBeTruthy();
	});

	it('sums the questions when Mass Consensus has no numbers yet', () => {
		renderCard();

		expect(useQuestionProgressByIds).toHaveBeenCalledWith(['q-one', 'q-two']);
		// 10 + 5 entered, 4 + 1 suggested, 2 + 1 evaluated
		expect(screen.getByLabelText(/15 entered, 5 suggested, 3 evaluated/i)).toBeTruthy();
	});

	it("prefers Mass Consensus's own count of who answered", () => {
		// The per-question counters miss survey answers entirely, which is how a
		// survey with 22 respondents reported nobody.
		useSurveyStats.mockReturnValue({
			survey_1712345678901_a1b2c3d: { entered: 26, responded: 22, completed: 15 },
		});
		renderCard();

		expect(useSurveyStats).toHaveBeenCalledWith('org-1', ['survey_1712345678901_a1b2c3d']);
		// A survey's funnel reads answered/finished, not suggested/evaluated.
		expect(screen.getByLabelText(/26 entered, 22 answered, 15 finished/i)).toBeTruthy();
		expect(screen.getByText(/26 opened it/i).textContent).toMatch(/22 answered/);
		expect(screen.getByText(/26 opened it/i).textContent).toMatch(/15 finished/);
	});

	it('links to the survey and its settings in Mass Consensus', () => {
		renderCard();

		const open = screen.getByRole('link', { name: /open the survey/i });
		const settings = screen.getByRole('link', { name: /survey settings/i });
		expect(open.getAttribute('href')).toContain('/s/survey_1712345678901_a1b2c3d');
		expect(settings.getAttribute('href')).toContain('/admin/surveys/survey_1712345678901_a1b2c3d');
	});

	it('falls back to the linked question when the survey lists none', () => {
		renderCard({ ...ACTIVITY, surveyQuestionIds: undefined });

		expect(useQuestionProgressByIds).toHaveBeenCalledWith(['q-one']);
	});
});
