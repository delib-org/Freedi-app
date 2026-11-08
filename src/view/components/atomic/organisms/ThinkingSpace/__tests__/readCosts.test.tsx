import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import statements from '@/redux/statements/statementsSlice';
import { bulkLoadStatements } from '@/controllers/db/statements/bulkLoadStatements';
import AgreementHub from '../AgreementHub';

jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
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
const question = {
	statementId: 'large-question',
	statement: 'What should we do?',
	statementType: StatementType.question,
} as Statement;

it('does not fetch all proposals for compact boards or document/map views', async () => {
	const store = configureStore({ reducer: { statements } });
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
	view.rerender(
		<Provider store={store}>
			<AgreementHub statement={question} view="overview" />
		</Provider>,
	);
	await waitFor(() => expect(bulkLoadStatements).toHaveBeenCalledTimes(1));
	expect(bulkLoadStatements).toHaveBeenCalledWith(question.statementId, 'direct');
});
