import React from 'react';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { Screen, Statement, StatementType } from '@freedi/shared-types';
import statements from '@/redux/statements/statementsSlice';
import answerViews from '@/redux/answerViews/answerViewsSlice';
import { creatorSlice } from '@/redux/creator/creatorSlice';
import { EntryVerdict } from '@/helpers/entryVerdict';
import AgreementHub from '../AgreementHub';
import LiveMapWorkspace from '../LiveMapWorkspace';

let mockVerdict: EntryVerdict | undefined;

jest.mock('react-router', () => ({
	useNavigate: () => jest.fn(),
	useLocation: () => ({ pathname: '/statement-screen/q1/agreement-map' }),
}));
jest.mock('@/controllers/hooks/useLevelVerdict', () => ({
	useLevelVerdict: (levelId?: string) => (levelId ? mockVerdict : undefined),
}));
jest.mock('@/view/pages/statement/components/questionScreen/useAnswerScoreGate', () => ({
	useQuestionScoreAccess: () => ({ canSee: true, facts: {} }),
}));
jest.mock('../QuestionProcess', () => ({ __esModule: true, default: () => null }));
jest.mock(
	'@/view/pages/statement/components/settings/components/synthesisPanel/SynthesisPanel',
	() => ({ __esModule: true, default: () => null }),
);
jest.mock('@/view/components/shareModal/ShareModal', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({ isAdmin: false }),
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
	statementId: 'q1',
	parentId: 'group',
	statement: 'A question',
	statementType: StatementType.question,
} as Statement;

function withStore(ui: React.ReactElement) {
	const store = configureStore({
		reducer: { statements, answerViews, creator: creatorSlice.reducer },
	});

	return render(<Provider store={store}>{ui}</Provider>);
}

const notOpen: Array<EntryVerdict | undefined> = ['closed', 'waiting', 'gone', undefined];

describe('AgreementHub Question path', () => {
	const renderHub = (statement: Statement = question) =>
		withStore(<AgreementHub statement={statement} view="overview" />);

	it('shows the way up when the direct parent is open', () => {
		mockVerdict = 'open';
		renderHub();

		expect(screen.getByRole('navigation', { name: 'Question path' })).toBeInTheDocument();
	});

	it.each(notOpen)('hides it when the verdict is %s', (verdict) => {
		mockVerdict = verdict;
		renderHub();

		expect(screen.queryByRole('navigation', { name: 'Question path' })).not.toBeInTheDocument();
	});

	it('hides it at the top', () => {
		mockVerdict = 'open';
		renderHub({ ...question, parentId: 'top' });

		expect(screen.queryByRole('navigation', { name: 'Question path' })).not.toBeInTheDocument();
	});
});

describe('LiveMapWorkspace Parent question', () => {
	const renderMap = (active: Screen = Screen.agreementMap) =>
		render(
			<LiveMapWorkspace statement={question} active={active as never}>
				<div />
			</LiveMapWorkspace>,
		);

	it('shows the button when the direct parent is open', () => {
		mockVerdict = 'open';
		renderMap();

		expect(screen.getByRole('button', { name: 'Parent question' })).toBeInTheDocument();
	});

	it.each(notOpen)('hides it when the verdict is %s', (verdict) => {
		mockVerdict = verdict;
		renderMap();

		expect(screen.queryByRole('button', { name: 'Parent question' })).not.toBeInTheDocument();
		expect(screen.queryByRole('navigation', { name: 'Question path' })).not.toBeInTheDocument();
	});

	it('keeps the themes link on the cluster board with the parent hidden', () => {
		mockVerdict = 'closed';
		renderMap(Screen.clusterBoard);

		expect(screen.queryByRole('button', { name: 'Parent question' })).not.toBeInTheDocument();
		expect(screen.getByRole('navigation', { name: 'Question path' })).toBeInTheDocument();
	});
});
