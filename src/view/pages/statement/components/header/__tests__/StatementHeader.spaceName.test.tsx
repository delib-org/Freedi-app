import React from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { EntryVerdict } from '@/helpers/entryVerdict';
import { StatementContext } from '../../../StatementCont';
import StatementHeader from '../StatementHeader';

let mockVerdict: EntryVerdict | undefined;
const mockUseLevelVerdict = jest.fn((levelId?: string) => (levelId ? mockVerdict : undefined));

jest.mock('react-router', () => ({
	Link: () => null,
	useLocation: () => ({ pathname: '/statement/q1', search: '' }),
	useNavigate: () => jest.fn(),
	useParams: () => ({}),
	useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));
jest.mock('react-redux', () => ({ useSelector: () => [] }));
jest.mock('@/controllers/hooks/useLevelVerdict', () => ({
	useLevelVerdict: (levelId?: string) => mockUseLevelVerdict(levelId),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr', currentLanguage: 'en' }),
}));
jest.mock('@/controllers/hooks/useParticipationStats', () => ({
	useParticipationStats: () => undefined,
}));
jest.mock('@/controllers/hooks/useRecordQuestionView', () => ({
	useRecordQuestionView: jest.fn(),
}));
jest.mock('@/controllers/hooks/useLoadOwnVote', () => ({ useLoadOwnVote: jest.fn() }));
jest.mock('@/controllers/hooks/useOpenAskQuestion', () => ({
	useOpenAskQuestion: () => jest.fn(),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => undefined }));
jest.mock('@/controllers/db/authenticationUtils', () => ({ logOut: jest.fn() }));
jest.mock('@/controllers/db/statements/setStatements', () => ({ setFollowMeDB: jest.fn() }));
jest.mock('@/controllers/db/statements/updateStatementFields', () => ({
	updateStatementText: jest.fn(),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => () => undefined,
	statementSubsSelector: () => () => [],
	statementOptionsSelector: () => () => [],
	questionsSelector: () => () => [],
}));
jest.mock('@/redux/notificationsSlice/notificationsSlice', () => ({
	inAppNotificationsSelector: () => [],
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: () => undefined }));
jest.mock('@/utils/engagementNavigation', () => ({ relevantNotifications: () => [] }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@/helpers/questionStage', () => ({
	showsStageBar: () => false,
	STAGE_LABEL_KEYS: [],
}));
jest.mock('../../questionScreen/resultsLogic', () => ({ getStageCue: () => undefined }));
jest.mock('../../questionScreen/useQuestionScreenData', () => ({
	useQuestionScreenData: () => ({ isHost: false, stage: 0 }),
}));
jest.mock('../../questionScreen/questionTabs', () => ({
	buildQuestionTabs: () => [],
	HOW_IT_WORKS_ANCHOR: 'how',
	resolveActiveView: () => 'chat',
	tabOfView: () => 'chat',
}));
jest.mock('../../../StatementCont', () => {
	const { createContext } = jest.requireActual('react');

	return { StatementContext: createContext({}) };
});
jest.mock('../invitePanel/InvitePanel', () => ({ __esModule: true, default: () => null }));
jest.mock('../AnswerStateStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../Back', () => ({ __esModule: true, default: () => null }));
jest.mock('../../host/HostHubSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../../nav/top/headerMenu/HeaderMenu', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/shareModal/ShareModal', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/atomic/molecules/QuestionTabs/QuestionTabs', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/atomic/molecules/StageProgress/StageProgress', () => ({
	__esModule: true,
	default: () => null,
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
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));

const question = { statementId: 'q1', topParentId: 'group', statement: 'A question' } as Statement;
const group = { statementId: 'group', statement: 'The closed group' } as Statement;

function renderHeader(topParent: Statement, current: Statement = question) {
	return render(
		<StatementContext.Provider value={{ statement: current } as never}>
			<StatementHeader topParentStatement={topParent} onActiveViewChange={jest.fn()} />
		</StatementContext.Provider>,
	);
}

describe('StatementHeader space name', () => {
	beforeEach(() => {
		mockVerdict = undefined;
		mockUseLevelVerdict.mockClear();
	});

	it('names the space, with its title, when the top parent is open', () => {
		mockVerdict = 'open';
		renderHeader(group);

		expect(screen.getByText('The closed group')).toHaveAttribute('title', 'The closed group');
	});

	it.each<EntryVerdict | undefined>(['closed', 'waiting', 'gone', undefined])(
		'leaves the name and the title out when the verdict is %s',
		(verdict) => {
			mockVerdict = verdict;
			const { container } = renderHeader(group);

			expect(screen.queryByText('The closed group')).not.toBeInTheDocument();
			expect(container.querySelector('[title="The closed group"]')).toBeNull();
		},
	);

	it('asks nothing on the top level itself', () => {
		renderHeader(group, { ...group, topParentId: 'group' });

		expect(mockUseLevelVerdict).toHaveBeenCalledWith(undefined);
	});
});
