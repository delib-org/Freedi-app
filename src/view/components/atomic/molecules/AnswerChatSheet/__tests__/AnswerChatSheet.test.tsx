import { render, screen } from '@testing-library/react';
import { AnswerChatSheet } from '../index';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => [] }));
jest.mock('@/controllers/hooks/useReadVisibleNotifications', () => ({
	useReadVisibleNotifications: jest.fn(),
}));
jest.mock('@/controllers/db/statements/listenToStatements', () => ({
	listenToSubStatements: () => () => undefined,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => () => undefined,
	statementSubsSelector: () => () => [],
}));
jest.mock('@/redux/notificationsSlice/notificationsSlice', () => ({
	inAppNotificationsSelector: () => [],
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: () => undefined }));
jest.mock('@/view/pages/statement/components/chat/components/input/StatementInputCont', () => ({
	handleAddStatement: jest.fn(),
}));
jest.mock('../../Modal/useDialogBehaviour', () => ({ useDialogBehaviour: jest.fn() }));
jest.mock('../AnswerChatMessage', () => ({ __esModule: true, default: () => null }));

describe('AnswerChatSheet wording', () => {
	it('keeps the answer wording by default', () => {
		render(<AnswerChatSheet isOpen onClose={jest.fn()} answerId="a1" answerText="An answer" />);

		expect(screen.getByText('Conversation about the answer')).toBeInTheDocument();
		expect(screen.getByTestId('answer-chat-sheet-input')).toHaveAttribute(
			'placeholder',
			'Add to the conversation about the answer…',
		);
	});

	it('uses the message wording when the subject is a message', () => {
		render(
			<AnswerChatSheet
				isOpen
				onClose={jest.fn()}
				answerId="m1"
				answerText="A message"
				subject="message"
			/>,
		);

		expect(screen.getByText('Conversation about the message')).toBeInTheDocument();
		expect(screen.queryByText('Conversation about the answer')).toBeNull();
		expect(screen.getByTestId('answer-chat-sheet-input')).toHaveAttribute(
			'placeholder',
			'Add to the conversation about the message…',
		);
	});
});
