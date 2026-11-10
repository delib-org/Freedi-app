import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import statements from '@/redux/statements/statementsSlice';
import answerViews from '@/redux/answerViews/answerViewsSlice';
import { creatorSlice } from '@/redux/creator/creatorSlice';
import { fetchTopAnswers } from '@/controllers/db/statements/topAnswers';
import { bulkLoadStatements } from '@/controllers/db/statements/bulkLoadStatements';
import AgreementHub from '../AgreementHub';

jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
jest.mock('@/view/pages/statement/components/questionScreen/useAnswerScoreGate', () => ({
	useQuestionScoreAccess: () => ({ canSee: true, facts: {} }),
}));
jest.mock('../QuestionProcess', () => ({ __esModule: true, default: () => null }));
jest.mock(
	'@/view/pages/statement/components/settings/components/synthesisPanel/SynthesisPanel',
	() => ({ __esModule: true, default: () => null }),
);
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({ isAdmin: true }),
}));
jest.mock('@/controllers/hooks/useIsProcessHalted', () => ({
	useIsProcessHalted: () => ({ isHalted: false }),
}));
jest.mock('@/controllers/db/statements/bulkLoadStatements', () => ({
	bulkLoadStatements: jest.fn(async () => ({ watermark: 1 })),
}));
jest.mock('@/controllers/db/statements/topAnswers', () => ({
	fetchTopAnswers: jest.fn(async () => ({ ids: [], hasMore: false, cursor: undefined })),
}));
const question = {
	statementId: 'large-question',
	statement: 'What should we do?',
	statementType: StatementType.question,
} as Statement;

it('fetches every proposal only for themes, and pages the top ones for the overview', async () => {
	const store = configureStore({
		reducer: { statements, answerViews, creator: creatorSlice.reducer },
	});
	const view = render(
		<Provider store={store}>
			<AgreementHub statement={question} compact />
		</Provider>,
	);
	for (const tab of ['summary', 'covenant', 'maps'])
		view.rerender(
			<Provider store={store}>
				<AgreementHub statement={question} view={tab} />
			</Provider>,
		);
	expect(bulkLoadStatements).not.toHaveBeenCalled();
	expect(fetchTopAnswers).not.toHaveBeenCalled();
	view.rerender(
		<Provider store={store}>
			<AgreementHub statement={question} view="overview" />
		</Provider>,
	);
	await waitFor(() => expect(fetchTopAnswers).toHaveBeenCalledTimes(1));
	expect(bulkLoadStatements).not.toHaveBeenCalled();
	view.rerender(
		<Provider store={store}>
			<AgreementHub statement={question} view="themes" />
		</Provider>,
	);
	await waitFor(() => expect(bulkLoadStatements).toHaveBeenCalledTimes(1));
	expect(bulkLoadStatements).toHaveBeenCalledWith(question.statementId, 'direct');
});
