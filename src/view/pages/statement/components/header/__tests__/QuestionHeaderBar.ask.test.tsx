import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import QuestionHeaderBar from '../QuestionHeaderBar';
import { OpenAskQuestionContext } from '@/controllers/hooks/useOpenAskQuestion';

let mockUser: { uid: string } | null = { uid: 'u1' };

jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: unknown) =>
		typeof selector === 'function' ? (selector as () => unknown)() : undefined,
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: () => mockUser }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => () => undefined,
}));
jest.mock('@/view/components/approveMembers/WaitingList', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/notificationBtn/NotificationBtn', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/notifications/NotificationSettingsButton', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../Back', () => ({ __esModule: true, default: () => null }));
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));
jest.mock('../../nav/top/headerMenu/HeaderMenu', () => ({
	__esModule: true,
	default: ({ onAskQuestion }: { onAskQuestion?: () => void }) =>
		onAskQuestion ? (
			<button type="button" onClick={onAskQuestion}>
				Ask a question
			</button>
		) : null,
}));

function renderBar(statementType: StatementType): jest.Mock {
	const openAsk = jest.fn();
	const statement = { statementId: 's1', topParentId: 's1', statementType } as Statement;
	render(
		<OpenAskQuestionContext.Provider value={openAsk}>
			<QuestionHeaderBar
				statement={statement}
				isHost={false}
				onShare={jest.fn()}
				onOpenHub={jest.fn()}
				onFollowMe={jest.fn()}
				onInvitePanel={jest.fn()}
				onLogout={jest.fn()}
				isMenuOpen
				setIsMenuOpen={jest.fn()}
			/>
		</OpenAskQuestionContext.Provider>,
	);

	return openAsk;
}

describe('QuestionHeaderBar Ask a question row', () => {
	beforeEach(() => {
		mockUser = { uid: 'u1' };
	});

	it('is offered on a group to a signed-in user and opens the sheet', () => {
		const openAsk = renderBar(StatementType.group);

		fireEvent.click(screen.getByText('Ask a question'));
		expect(openAsk).toHaveBeenCalledTimes(1);
	});

	it('is not offered on a question or an answer', () => {
		renderBar(StatementType.question);

		expect(screen.queryByText('Ask a question')).toBeNull();
	});

	it('is not offered to a signed-out user', () => {
		mockUser = null;
		renderBar(StatementType.group);

		expect(screen.queryByText('Ask a question')).toBeNull();
	});
});
