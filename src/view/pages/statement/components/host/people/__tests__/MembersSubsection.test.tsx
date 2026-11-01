import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Role, Statement, StatementSubscription, WaitingMember } from '@freedi/shared-types';
import { updateMemberRole } from '@/controllers/db/subscriptions/setSubscriptions';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import MembersSubsection from '../MembersSubsection';
import { usePeopleToast } from '../usePeopleToast';
import { MembersPaging } from '../useMembersPaging';
import { WaitingDecisions } from '../useWaitingDecisions';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr', currentLanguage: 'en' }),
}));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	updateMemberRole: jest.fn(),
}));

interface FakeState {
	creator: { uid: string } | null;
	selfSubscription: { role: Role } | undefined;
}
let fakeState: FakeState;
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: FakeState) => unknown) => selector(fakeState),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({
	creatorSelector: (state: FakeState) => state.creator,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSubscriptionSelector: () => (state: FakeState) => state.selfSubscription,
}));

const mockedUpdateRole = updateMemberRole as jest.MockedFunction<typeof updateMemberRole>;

const statement = { statementId: 's1', creator: { uid: 'u-tal' } } as Statement;

function sub(id: string, role: Role, displayName: string): StatementSubscription {
	return {
		statementsSubscribeId: id,
		statementId: 's1',
		userId: `u-${id}`,
		role,
		createdAt: Date.now() - 1000,
		user: { uid: `u-${id}`, displayName },
	} as StatementSubscription;
}

const tal = sub('tal', Role.admin, 'Tal');
const maya = sub('maya', Role.admin, 'Maya');
const dana = sub('dana', Role.member, 'Dana');
const roi = sub('roi', Role.banned, 'Roi');
const wanda = sub('wanda', Role.waiting, 'Wanda');

function decisionsFor(visible: WaitingMember[] = []): WaitingDecisions {
	return { visible, rowErrors: new Map(), decide: jest.fn() };
}

const noPaging: MembersPaging = {
	total: null,
	hasMoreOnServer: false,
	isLoadingMore: false,
	loadFailed: false,
	loadMore: jest.fn().mockResolvedValue(undefined),
};

function Harness({
	members,
	decisions = decisionsFor(),
	paging = noPaging,
}: {
	members: StatementSubscription[];
	decisions?: WaitingDecisions;
	paging?: MembersPaging;
}) {
	const toaster = usePeopleToast();
	const { toast } = toaster;

	return (
		<MemoryRouter>
			<MembersSubsection
				statement={statement}
				members={members}
				decisions={decisions}
				toaster={toaster}
				paging={paging}
				onAnnounce={jest.fn()}
				isOpen
				onToggle={jest.fn()}
				toggleRef={jest.fn()}
			/>
			{toast && (
				<ActionToast
					key={toast.id}
					message={toast.message}
					actionLabel={toast.actionLabel}
					onAction={toast.onAction}
					durationMs={toast.durationMs}
					onDismiss={toaster.dismiss}
				/>
			)}
		</MemoryRouter>
	);
}

const rowOf = (id: string) => within(screen.getByTestId(`member-row-${id}`));
const names = () =>
	Array.from(document.querySelectorAll('.person-row__name')).map((el) => el.textContent);

describe('MembersSubsection', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedUpdateRole.mockResolvedValue(undefined);
		// Signed in as Tal, the creator.
		fakeState = { creator: { uid: 'u-tal' }, selfSubscription: { role: Role.admin } };
	});

	it('lists hosts first with Creator / You / Host / Blocked as words', () => {
		render(<Harness members={[dana, roi, maya, tal]} />);

		expect(names()).toEqual(['Tal', 'Maya', 'Dana', 'Roi']);
		expect(rowOf('tal').getByText('Creator')).toHaveClass('person-row__badge--creator');
		expect(rowOf('tal').getByText('people.role.you')).toHaveClass('person-row__badge--you');
		expect(rowOf('maya').getByText('people.role.host')).toHaveClass('person-row__badge--host');
		expect(rowOf('roi').getByText('people.role.banned')).toHaveClass('person-row__badge--blocked');
		expect(screen.getByTestId('member-row-roi')).toHaveClass('person-row--blocked');
	});

	it('gives each role its actions and none to the creator or yourself', () => {
		render(<Harness members={[tal, maya, dana, roi]} />);

		expect(rowOf('tal').queryAllByRole('button')).toHaveLength(0);
		expect(rowOf('maya').getByRole('button', { name: 'people.removeHost: Maya' })).toBeTruthy();
		expect(rowOf('maya').queryByRole('button', { name: /people\.block/ })).toBeNull();
		expect(rowOf('dana').getByRole('button', { name: 'people.makeHost: Dana' })).toBeTruthy();
		expect(rowOf('dana').getByRole('button', { name: 'people.block: Dana' })).toBeTruthy();
		expect(rowOf('roi').getByRole('button', { name: 'people.unblock: Roi' })).toBeTruthy();
	});

	it('offers no actions to someone who is not a host here', () => {
		fakeState = { creator: { uid: 'u-dana' }, selfSubscription: { role: Role.member } };
		render(<Harness members={[tal, maya, dana, roi]} />);

		expect(document.querySelectorAll('.person-row__actions')).toHaveLength(0);
		expect(screen.queryByText('people.noOneToPromote')).toBeNull();
	});

	it('pairs every row that has actions with a ⋯ button for phones', () => {
		render(<Harness members={[tal, dana]} />);

		expect(screen.getByTestId('member-row-dana')).toHaveClass('person-row--menu-on-mobile');
		expect(screen.getByTestId('member-row-tal')).not.toHaveClass('person-row--menu-on-mobile');
		expect(rowOf('dana').getByRole('button', { name: 'people.actionsFor' })).toHaveAttribute(
			'aria-haspopup',
			'dialog',
		);
	});

	it('the ⋯ sheet repeats name and role and lists the same actions, Cancel last', () => {
		render(<Harness members={[tal, maya]} />);
		fireEvent.click(rowOf('maya').getByRole('button', { name: 'people.actionsFor' }));
		const sheet = within(screen.getByRole('dialog'));

		expect(sheet.getByRole('heading', { name: 'Maya' })).toBeTruthy();
		expect(sheet.getByText('people.role.host')).toBeTruthy();
		const labels = sheet
			.getAllByRole('button')
			.map((b) => b.textContent)
			.filter((text) => text);
		expect(labels).toEqual(['people.removeHost', 'Cancel']);

		fireEvent.click(sheet.getByRole('button', { name: 'people.removeHost' }));
		expect(mockedUpdateRole).toHaveBeenCalledWith('s1', 'u-maya', Role.member);
		expect(screen.queryByRole('heading', { name: 'Maya' })).toBeNull();
	});

	it('filters with the chips and counts each one', () => {
		render(<Harness members={[tal, maya, dana, roi, wanda]} />);
		const chips = within(screen.getByRole('group', { name: 'people.filterMembers' }));
		const all = chips.getByRole('button', { name: /people\.filter\.all/ });

		expect(all).toHaveAttribute('aria-pressed', 'true');
		expect(all).toHaveTextContent('5');
		expect(chips.getByRole('button', { name: /people\.hosts/ })).toHaveTextContent('2');

		fireEvent.click(chips.getByRole('button', { name: /people\.role\.banned/ }));
		expect(names()).toEqual(['Roi']);
		fireEvent.click(chips.getByRole('button', { name: /people\.role\.waiting/ }));
		expect(names()).toEqual(['Wanda']);
	});

	it('Make host: optimistic badge, a toast, and Undo writes the old role back', async () => {
		render(<Harness members={[tal, dana]} />);
		fireEvent.click(rowOf('dana').getByRole('button', { name: 'people.makeHost: Dana' }));

		expect(mockedUpdateRole).toHaveBeenCalledWith('s1', 'u-dana', Role.admin);
		expect(rowOf('dana').getByText('people.role.host')).toBeTruthy();
		expect(screen.getByText('people.nowHostToast')).toBeTruthy();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'people.undo' }));
		});
		await waitFor(() =>
			expect(mockedUpdateRole).toHaveBeenLastCalledWith('s1', 'u-dana', Role.member),
		);
		expect(await screen.findByText('people.undone')).toBeTruthy();
	});

	it('a failed role write puts the row back and says so under it', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
		mockedUpdateRole.mockRejectedValueOnce(new Error('denied'));
		render(<Harness members={[tal, dana]} />);

		await act(async () => {
			fireEvent.click(rowOf('dana').getByRole('button', { name: 'people.makeHost: Dana' }));
		});

		expect(rowOf('dana').queryByText('people.role.host')).toBeNull();
		expect(rowOf('dana').getByText('Failed to update role')).toBeTruthy();
		expect(screen.queryByText('people.nowHostToast')).toBeNull();
	});

	it('a failed Undo offers Retry', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
		render(<Harness members={[tal, roi]} />);
		fireEvent.click(rowOf('roi').getByRole('button', { name: 'people.unblock: Roi' }));
		mockedUpdateRole.mockRejectedValueOnce(new Error('offline'));

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'people.undo' }));
		});

		expect(await screen.findByText('people.couldNotUndo')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'people.retry' })).toBeTruthy();
	});

	it('Block asks first with Cancel focused; Cancel writes nothing', () => {
		render(<Harness members={[tal, dana]} />);
		fireEvent.click(rowOf('dana').getByRole('button', { name: 'people.block: Dana' }));
		const dialog = within(screen.getByRole('dialog'));

		expect(dialog.getByText('people.block.title')).toBeTruthy();
		expect(dialog.getByText('people.block.body')).toBeTruthy();
		expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Cancel' }));

		fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
		expect(mockedUpdateRole).not.toHaveBeenCalled();
	});

	it('Block, confirmed: the row turns Blocked, a toast offers Undo', async () => {
		render(<Harness members={[tal, dana]} />);
		fireEvent.click(rowOf('dana').getByRole('button', { name: 'people.block: Dana' }));
		fireEvent.click(
			within(screen.getByRole('dialog')).getByRole('button', { name: 'people.block' }),
		);

		expect(mockedUpdateRole).toHaveBeenCalledWith('s1', 'u-dana', Role.banned);
		expect(rowOf('dana').getByText('people.role.banned')).toBeTruthy();
		expect(screen.getByText('people.blockedToast')).toBeTruthy();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'people.undo' }));
		});
		await waitFor(() =>
			expect(mockedUpdateRole).toHaveBeenLastCalledWith('s1', 'u-dana', Role.member),
		);
	});

	it('Waiting rows inside Members use the Waiting decisions', () => {
		const waitingRecord = {
			statementsSubscribeId: 'wanda',
			userId: 'u-wanda',
			statementId: 's1',
		} as WaitingMember;
		const decisions = decisionsFor([waitingRecord]);
		render(<Harness members={[tal, wanda]} decisions={decisions} />);

		fireEvent.click(rowOf('wanda').getByRole('button', { name: 'people.letIn: Wanda' }));
		expect(decisions.decide).toHaveBeenCalledWith([waitingRecord], 'letIn');
		expect(mockedUpdateRole).not.toHaveBeenCalled();
	});

	it('nobody joined yet: empty state with the invite link and the promote hint', () => {
		render(<Harness members={[tal]} />);

		expect(screen.getByText('people.members.empty')).toBeTruthy();
		expect(screen.getByText('people.noOneToPromote')).toBeTruthy();
		expect(screen.getByTestId('invite-link-to-live')).toBeTruthy();
	});

	it('keeps the "nobody to promote" hint when only hosts and blocked people remain', () => {
		render(<Harness members={[tal, maya, roi]} />);

		expect(screen.getByText('people.noOneToPromote')).toBeTruthy();
		expect(screen.queryByText('people.members.empty')).toBeNull();
	});

	it('shows 10 first, then 20 more, with an "n of m" caption', () => {
		const many = Array.from({ length: 25 }, (_, i) =>
			sub(`m${String(i).padStart(2, '0')}`, Role.member, `Member ${String(i).padStart(2, '0')}`),
		);
		render(<Harness members={[tal, ...many]} />);

		expect(names()).toHaveLength(10);
		expect(screen.getByText('people.nOfM')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'people.showMore' }));
		expect(names()).toHaveLength(26);
		expect(screen.queryByRole('button', { name: 'people.showMore' })).toBeNull();
	});

	it('when the loaded page runs out, Show more asks Firestore for the next page', () => {
		const loadMore = jest.fn().mockResolvedValue(undefined);
		const paging: MembersPaging = {
			...noPaging,
			total: 140,
			hasMoreOnServer: true,
			loadMore,
		};
		render(<Harness members={[tal, maya, dana]} paging={paging} />);

		expect(names()).toHaveLength(3);
		fireEvent.click(screen.getByRole('button', { name: 'people.showMore' }));
		expect(loadMore).toHaveBeenCalledTimes(1);
	});

	it('a failed page load says so and offers Retry', () => {
		const loadMore = jest.fn().mockResolvedValue(undefined);
		render(
			<Harness
				members={[tal, maya, dana]}
				paging={{ ...noPaging, total: 140, hasMoreOnServer: true, loadFailed: true, loadMore }}
			/>,
		);

		expect(screen.getByText('people.error.load')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'people.retry' }));
		expect(loadMore).toHaveBeenCalledTimes(1);
	});

	it('search filters by name after the debounce', () => {
		jest.useFakeTimers();
		render(<Harness members={[tal, maya, dana]} />);
		fireEvent.change(screen.getByRole('searchbox', { name: 'people.searchMembers' }), {
			target: { value: 'dan' },
		});
		act(() => {
			jest.runAllTimers();
		});

		expect(names()).toEqual(['Dana']);
		jest.useRealTimers();
	});
});
