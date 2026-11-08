import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import { StatementType, type OrganizationActivity, type Statement } from '@freedi/shared-types';

const ACTIVITY: OrganizationActivity = {
	activityId: 'org-1--q1',
	organizationId: 'org-1',
	statementId: 'q1',
	statementTitle: 'Q',
	addedBy: 'a',
	addedByDisplayName: 'A',
	addedAt: 1,
	lastUpdate: 1,
	surveyId: 'survey_1_a',
	surveyTitle: 'Transport survey',
	surveyQuestionIds: ['q1'],
};

function option(id: string, text: string, consensus: number, evaluators: number): Statement {
	return {
		statementId: id,
		statement: text,
		statementType: StatementType.option,
		parentId: 'q1',
		consensus,
		evaluation: { numberOfEvaluators: evaluators },
	} as Statement;
}

vi.mock('react-router-dom', () => ({
	Link: ({
		to,
		children,
		className,
	}: {
		to: string;
		children: React.ReactNode;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
	useParams: () => ({ orgId: 'org-1', qId: 'q1' }),
}));

vi.mock('@/db/orgActivities', () => ({
	useOrgActivity: () => ({ data: ACTIVITY, loading: false, error: null }),
	useStatementsByIds: () => ({
		data: [{ statementId: 'q1', statement: 'How do we get to work?' }],
		loading: false,
		error: null,
	}),
}));
vi.mock('@/db/surveyResults', () => ({
	useChildrenOfParents: () => ({
		data: [option('a', 'Bike lanes', 0.2, 4), option('b', 'Free buses', 0.7, 11)],
		loading: false,
		error: null,
	}),
}));
vi.mock('@/pages/_shared/StudioPage', () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import SurveyResults from '../SurveyResults';

function renderPage() {
	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<SurveyResults />
		</TranslationProvider>,
	);
}

describe('SurveyResults', () => {
	afterEach(cleanup);

	it('lists suggestions best-first with score and evaluators', () => {
		renderPage();

		const items = screen.getAllByRole('listitem');
		expect(items[0].textContent).toContain('Free buses');
		expect(items[0].textContent).toContain('Score 70');
		expect(items[0].textContent).toContain('11 evaluators');
		expect(items[1].textContent).toContain('Bike lanes');
	});

	it('renders no edit controls — only a way back', () => {
		renderPage();

		expect(screen.queryAllByRole('button')).toHaveLength(0);
		expect(screen.queryAllByRole('textbox')).toHaveLength(0);
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe('/orgs/org-1/questions/q1');
	});
});
