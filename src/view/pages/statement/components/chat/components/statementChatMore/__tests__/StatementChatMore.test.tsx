import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import StatementChatMore from '../StatementChatMore';

const mockNavigate = jest.fn();

const mockState = {
	creator: { creator: { uid: 'me' } },
	statements: {
		// The unread number comes from the server counter minus the person's
		// seen marker, never from notifications.
		statements: [
			{ statementId: 'answer-1', parentId: 'q', descendantMessageCount: 4 },
			{ statementId: 'm1', parentId: 'answer-1' },
			{ statementId: 'm2', parentId: 'answer-1' },
			{ statementId: 'm3', parentId: 'answer-1' },
			{ statementId: 'answer-2', parentId: 'q', descendantMessageCount: 2 },
		],
		statementSubscription: [{ statementId: 'answer-1', seenMessageCount: 3 }],
		seenMessageCounts: {},
		fetchedMessageCounts: {},
	},
};

const mockMarkSeen = jest.fn();
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	markStatementSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

jest.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
jest.mock('react-redux', () => ({
	useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'rtl' }),
}));
jest.mock('@/view/components/atomic/molecules/AnswerChatSheet', () => ({
	AnswerChatSheet: ({
		isOpen,
		answerId,
		answerText,
		onClose,
	}: {
		isOpen: boolean;
		answerId: string;
		answerText: string;
		onClose: () => void;
	}) =>
		isOpen ? (
			<div data-testid="answer-chat-sheet" data-answer={answerId}>
				{answerText}
				<button type="button" onClick={onClose}>
					close
				</button>
			</div>
		) : null,
}));

const answer = { statementId: 'answer-1', statement: 'Open the park at 7' } as unknown as Statement;

describe('StatementChatMore', () => {
	beforeEach(() => {
		mockNavigate.mockClear();
	});

	it('keeps navigating to the chat page by default', () => {
		render(<StatementChatMore statement={answer} />);

		fireEvent.click(screen.getByTestId('statement-chat-more-button'));

		expect(mockNavigate).toHaveBeenCalledWith(
			'/statement/answer-1/chat?tab=chat',
			expect.anything(),
		);
		expect(screen.queryByTestId('answer-chat-sheet')).not.toBeInTheDocument();
	});

	it('opens the answer chat sheet instead of navigating when opensSheet is set', () => {
		render(<StatementChatMore statement={answer} variant="pill" opensSheet />);

		const button = screen.getByTestId('statement-chat-more-button');
		expect(button).toHaveAttribute('aria-haspopup', 'dialog');

		fireEvent.click(button);

		expect(mockNavigate).not.toHaveBeenCalled();
		expect(mockMarkSeen).toHaveBeenCalledWith('answer-1', 'me');
		const sheet = screen.getByTestId('answer-chat-sheet');
		expect(sheet).toHaveAttribute('data-answer', 'answer-1');
		expect(sheet).toHaveTextContent('Open the park at 7');

		fireEvent.click(screen.getByText('close'));
		expect(screen.queryByTestId('answer-chat-sheet')).not.toBeInTheDocument();
	});

	it('renders the pill with the word, message count and the unread number (counter minus seen)', () => {
		render(<StatementChatMore statement={answer} variant="pill" opensSheet />);

		const pill = screen.getByTestId('statement-chat-more-pill');
		expect(pill).toHaveTextContent('Conversation');
		expect(pill).toHaveTextContent('3');
		expect(pill).toHaveAttribute('data-unread', 'true');
		expect(screen.getByTestId('statement-chat-more-unread')).toHaveTextContent('1');
		expect(screen.getByTestId('statement-chat-more-button')).toHaveAttribute(
			'aria-label',
			'3 messages. unread.messageCount_one. Click to open discussion',
		);
	});

	it('shows an idle pill when nothing is unread', () => {
		// answer-2 has messages but this person never opened it: no subscription, no number
		const quiet = { statementId: 'answer-2', statement: 'Quiet' } as unknown as Statement;
		render(<StatementChatMore statement={quiet} variant="pill" opensSheet />);

		expect(screen.getByTestId('statement-chat-more-pill')).toHaveAttribute('data-unread', 'false');
		expect(screen.queryByTestId('statement-chat-more-unread')).not.toBeInTheDocument();
	});
});
