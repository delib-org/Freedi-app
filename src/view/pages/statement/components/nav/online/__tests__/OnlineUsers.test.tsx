import { render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import { PRESENCE } from '@/constants/common';
import { useOnlineUsers } from '@/controllers/hooks/useOnlineUsers';
import { useQuestionProgressRead } from '@/controllers/hooks/useQuestionProgress';
import OnlineUsers from '../OnlineUsers';

jest.mock('@/controllers/hooks/useOnlineUsers', () => ({ useOnlineUsers: jest.fn() }));
jest.mock('@/controllers/hooks/useQuestionProgress', () => ({
	useQuestionProgressRead: jest.fn(),
}));
jest.mock('@/view/components/atomic/molecules/UserProfilePopover', () => ({
	UserProfilePopover: () => null,
}));

const mockOnline = useOnlineUsers as jest.Mock;
const mockRead = useQuestionProgressRead as jest.Mock;

const question = { statementId: 'q1', statementType: StatementType.question } as Statement;
const someoneOnline = {
	user: { uid: 'u1', displayName: 'Dana', photoURL: null },
	tabInFocus: true,
};

describe('OnlineUsers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOnline.mockReturnValue({ onlineUsers: [someoneOnline], isLoading: false });
		mockRead.mockReturnValue({ progress: { entered: 10 }, isLoaded: true });
	});

	it('shows who is here in a small question', () => {
		render(<OnlineUsers statement={question} />);

		expect(mockOnline).toHaveBeenCalledWith('q1');
		expect(screen.getByText('D')).toBeTruthy();
	});

	it('mounts no presence and renders nothing in a large question', () => {
		mockRead.mockReturnValue({
			progress: { entered: PRESENCE.LARGE_QUESTION_PEOPLE },
			isLoaded: true,
		});
		const { container } = render(<OnlineUsers statement={question} />);

		expect(mockOnline).not.toHaveBeenCalled();
		expect(container.firstChild).toBeNull();
	});

	it('mounts no presence until the size of the question is known', () => {
		mockRead.mockReturnValue({ progress: null, isLoaded: false });
		const { container } = render(<OnlineUsers statement={question} />);

		expect(mockOnline).not.toHaveBeenCalled();
		expect(container.firstChild).toBeNull();
	});

	it('skips the progress read for a statement that is not a question', () => {
		mockRead.mockReturnValue({ progress: null, isLoaded: true });
		render(
			<OnlineUsers
				statement={{ statementId: 's1', statementType: StatementType.group } as Statement}
			/>,
		);

		expect(mockRead.mock.calls[0][0]).toBeUndefined();
		expect(mockOnline).toHaveBeenCalledWith('s1');
	});

	it('renders nothing without a statement', () => {
		mockRead.mockReturnValue({ progress: null, isLoaded: true });
		const { container } = render(<OnlineUsers statement={undefined} />);

		expect(mockOnline).not.toHaveBeenCalled();
		expect(container.firstChild).toBeNull();
	});
});
