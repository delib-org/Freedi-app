import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { WaitingMember } from '@freedi/shared-types';
import { useApproveMembership } from '../WaitingListVM';
import WaitingList from '../WaitingList';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/assets/icons/group.svg?react', () => ({
	__esModule: true,
	default: () => <svg data-testid="members-icon" />,
}));
jest.mock('../WaitingListVM', () => ({ useApproveMembership: jest.fn() }));

const mockedUseApprove = useApproveMembership as jest.MockedFunction<typeof useApproveMembership>;

function waiting(statementId: string, id: string): WaitingMember {
	return { statementId, statementsSubscribeId: id, userId: id } as WaitingMember;
}

function renderAt(path: string) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/statement/:statementId" element={<WaitingList />} />
				<Route path="/home" element={<WaitingList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe('WaitingList header badge', () => {
	it('renders nothing when nobody waits', () => {
		mockedUseApprove.mockReturnValue({ waitingList: [] });
		const { container } = renderAt('/home');

		expect(container).toBeEmptyDOMElement();
	});

	it('is a link to People › Waiting to join of the space on screen, with a count pill', () => {
		mockedUseApprove.mockReturnValue({
			waitingList: [waiting('other', 'w1'), waiting('q1', 'w2'), waiting('q1', 'w3')],
		});
		renderAt('/statement/q1');
		const link = screen.getByTestId('waiting-badge');

		expect(link.tagName).toBe('A');
		expect(link).toHaveAttribute('href', '/statement-screen/q1/settings?section=people#waiting');
		expect(link).toHaveAttribute('aria-label', 'people.waitingCount');
		expect(document.querySelector('.badge')).toHaveTextContent('3');
		expect(document.querySelector('.badge')).toHaveClass('badge--unread', 'badge--top-right');
	});

	it('leads to the space with most people waiting when on the home page', () => {
		mockedUseApprove.mockReturnValue({
			waitingList: [waiting('a', 'w1'), waiting('b', 'w2'), waiting('b', 'w3')],
		});
		renderAt('/home');

		expect(screen.getByTestId('waiting-badge')).toHaveAttribute(
			'href',
			'/statement-screen/b/settings?section=people#waiting',
		);
	});

	it('opens no popover of its own', () => {
		mockedUseApprove.mockReturnValue({ waitingList: [waiting('q1', 'w1')] });
		renderAt('/statement/q1');

		expect(screen.queryByRole('checkbox')).toBeNull();
		expect(screen.queryByText('people.letIn')).toBeNull();
	});
});
