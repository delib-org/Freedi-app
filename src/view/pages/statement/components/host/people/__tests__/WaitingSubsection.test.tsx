import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WaitingMember } from '@freedi/shared-types';
import {
	approveMultiple,
	rejectMultiple,
	returnMultipleToWaiting,
} from '@/services/membershipActions';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import WaitingSubsection from '../WaitingSubsection';
import { useWaitingDecisions } from '../useWaitingDecisions';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr', currentLanguage: 'en' }),
}));
jest.mock('@/services/membershipActions', () => ({
	approveMultiple: jest.fn(),
	rejectMultiple: jest.fn(),
	returnMultipleToWaiting: jest.fn(),
}));

const mockedApprove = approveMultiple as jest.MockedFunction<typeof approveMultiple>;
const mockedReject = rejectMultiple as jest.MockedFunction<typeof rejectMultiple>;
const mockedReturn = returnMultipleToWaiting as jest.MockedFunction<typeof returnMultipleToWaiting>;

function member(id: string, displayName: string): WaitingMember {
	return {
		statementsSubscribeId: id,
		userId: `u-${id}`,
		statementId: 'q1',
		createdAt: Date.now() - 1000,
		user: { uid: `u-${id}`, displayName },
	} as WaitingMember;
}

const dana = member('w1', 'Dana');
const noam = member('w2', 'Noam');

function Harness({ members }: { members: WaitingMember[] }) {
	const decisions = useWaitingDecisions(members);

	return (
		<>
			<WaitingSubsection decisions={decisions} isOpen onToggle={jest.fn()} toggleRef={jest.fn()} />
			{decisions.toast && (
				<ActionToast
					key={decisions.toast.id}
					message={decisions.toast.message}
					actionLabel={decisions.toast.actionLabel}
					onAction={decisions.toast.onAction}
					durationMs={decisions.toast.durationMs}
					onDismiss={decisions.dismissToast}
				/>
			)}
		</>
	);
}

const rowOf = (id: string) => screen.queryByTestId(`waiting-row-${id}`);

describe('WaitingSubsection', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedApprove.mockResolvedValue([]);
		mockedReject.mockResolvedValue([]);
		mockedReturn.mockResolvedValue([]);
	});

	it('lists each waiting person with Let in and Decline and a count badge', () => {
		render(<Harness members={[dana, noam]} />);

		expect(screen.getByRole('button', { name: /people\.waiting/ })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(document.querySelector('.people-subsection__count')).toHaveTextContent('2');
		const row = within(rowOf('w1') as HTMLElement);
		expect(row.getByRole('button', { name: 'people.letIn: Dana' })).toHaveClass('button--approve');
		expect(row.getByRole('button', { name: 'people.decline: Dana' })).toBeTruthy();
		expect(row.getByText(/people\.waiting\.asked/)).toBeTruthy();
	});

	it('lets one person in at once, with an Undo toast', async () => {
		render(<Harness members={[dana, noam]} />);

		fireEvent.click(screen.getByRole('button', { name: 'people.letIn: Dana' }));

		expect(rowOf('w1')).toBeNull();
		expect(mockedApprove).toHaveBeenCalledWith([dana]);
		const toast = screen.getByTestId('action-toast');
		expect(toast).toHaveTextContent('people.letInToast');
		expect(within(toast).getByRole('button', { name: 'people.undo' })).toBeTruthy();
		await act(async () => undefined);
	});

	it('Undo puts the person back on the waiting list after the decision lands', async () => {
		render(<Harness members={[dana, noam]} />);
		fireEvent.click(screen.getByRole('button', { name: 'people.decline: Dana' }));
		expect(mockedReject).toHaveBeenCalledWith([dana]);

		fireEvent.click(screen.getByRole('button', { name: 'people.undo' }));

		await waitFor(() => expect(mockedReturn).toHaveBeenCalledWith([dana]));
		expect(await screen.findByText('people.undone')).toBeTruthy();
		expect(rowOf('w1')).not.toBeNull();
	});

	it('returns a row with an inline error when its write fails', async () => {
		mockedApprove.mockResolvedValue([dana]);
		render(<Harness members={[dana, noam]} />);

		fireEvent.click(screen.getByRole('button', { name: 'people.letIn: Dana' }));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('people.error.letIn');
		expect(rowOf('w1')).toContainElement(alert);
		expect(screen.queryByTestId('action-toast')).toBeNull();
	});

	it('shows a selection bar and lets the selection in without a confirm', async () => {
		render(<Harness members={[dana, noam]} />);

		fireEvent.click(screen.getByRole('checkbox', { name: 'people.selectAll' }));
		const bar = screen.getByRole('group', { name: 'people.waiting' });
		expect(bar).toHaveTextContent('people.nSelected');

		fireEvent.click(within(bar).getByRole('button', { name: 'people.letIn' }));

		expect(mockedApprove).toHaveBeenCalledWith([dana, noam]);
		expect(screen.getByTestId('action-toast')).toHaveTextContent('people.letInCount');
		await act(async () => undefined);
	});

	it('asks before declining several people', async () => {
		render(<Harness members={[dana, noam]} />);
		const [first, second] = screen.getAllByRole('checkbox', { name: 'people.selectPerson' });
		fireEvent.click(first);
		fireEvent.click(second);

		fireEvent.click(
			within(screen.getByRole('group', { name: 'people.waiting' })).getByRole('button', {
				name: 'people.decline',
			}),
		);
		const dialog = screen.getByRole('dialog');
		expect(dialog).toHaveTextContent('people.declineN.title');
		expect(mockedReject).not.toHaveBeenCalled();

		fireEvent.click(within(dialog).getByRole('button', { name: 'people.declineN.confirm' }));

		expect(mockedReject).toHaveBeenCalledWith([dana, noam]);
		expect(screen.queryByRole('dialog')).toBeNull();
		await act(async () => undefined);
	});

	it('declines a single selected person without a confirm', async () => {
		render(<Harness members={[dana, noam]} />);
		fireEvent.click(screen.getAllByRole('checkbox', { name: 'people.selectPerson' })[0]);

		fireEvent.click(
			within(screen.getByRole('group', { name: 'people.waiting' })).getByRole('button', {
				name: 'people.decline',
			}),
		);

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(mockedReject).toHaveBeenCalledWith([dana]);
		await act(async () => undefined);
	});

	it('says nobody is waiting when the list is empty', () => {
		render(<Harness members={[]} />);

		expect(screen.getByText('people.waiting.empty')).toBeTruthy();
		expect(document.querySelector('.people-subsection__count')).toBeNull();
	});
});
