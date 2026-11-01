import * as fs from 'node:fs';
import * as path from 'node:path';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Access, Statement, StatementType, WaitingMember } from '@freedi/shared-types';
import { useApproveMembership } from '@/view/components/approveMembers/WaitingListVM';
import { renderWithProviders } from '@/test-utils/test-utils';
import PeopleSection from '../PeopleSection';
import { FORM_COMPOSITION } from '../../settings/components/statementSettingsForm/StatementSettingsForm';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));

jest.mock('@/view/components/approveMembers/WaitingListVM', () => ({
	useApproveMembership: jest.fn(),
}));
jest.mock('@/services/membershipActions', () => ({
	approveMultiple: jest.fn().mockResolvedValue([]),
	rejectMultiple: jest.fn().mockResolvedValue([]),
	returnMultipleToWaiting: jest.fn().mockResolvedValue([]),
}));

const mockedUseApprove = useApproveMembership as jest.MockedFunction<typeof useApproveMembership>;

function mockStub(testId: string) {
	return {
		__esModule: true,
		default: () => <div data-testid={testId} />,
	};
}

jest.mock('../../settings/components/membershipSettings/MembershipSettings', () =>
	mockStub('membership'),
);
jest.mock('../../settings/components/memberValidation/MemberValidation', () =>
	mockStub('validation'),
);
jest.mock('../../settings/components/UserDemographicSettings/UserDemographicSetting', () =>
	mockStub('demographics'),
);
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	updateMemberRole: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../settings/components/optionRooms', () => ({
	OptionRooms: () => <div data-testid="rooms" />,
}));
jest.mock('../../settings/components/QuestionSettings/ConfidenceIndexSettings', () =>
	mockStub('stakeholders-setting'),
);

function makeStatement(statementType: StatementType, access?: Access): Statement {
	return {
		membership: access ? { access } : undefined,
		statementId: 's1',
		topParentId: 's1',
		parentId: 'top',
		statement: 'S',
		statementType,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
	} as Statement;
}

function renderPeople(statement: Statement, hash = '') {
	return renderWithProviders(
		<MemoryRouter initialEntries={[`/statement-screen/s1/settings?section=people${hash}`]}>
			<PeopleSection statement={statement} setStatementToEdit={jest.fn()} />
		</MemoryRouter>,
	);
}

function waiting(id: string, statementId = 's1'): WaitingMember {
	return {
		statementsSubscribeId: id,
		userId: `u-${id}`,
		statementId,
		createdAt: 1,
		user: { uid: `u-${id}`, displayName: `Person ${id}` },
	} as WaitingMember;
}

beforeEach(() => {
	mockedUseApprove.mockReturnValue({ waitingList: [] });
});

describe('PeopleSection stakeholders', () => {
	it.each([StatementType.question, StatementType.group])(
		'renders the stakeholder count once for a %s',
		(type) => {
			renderPeople(makeStatement(type));

			expect(screen.getAllByTestId('stakeholders-setting')).toHaveLength(1);
			expect(screen.getByText('host.people.stakeholders')).toBeTruthy();
		},
	);

	it('Results & Decision group no longer composes it, and the hub list does not either', () => {
		const source = fs.readFileSync(
			path.resolve(
				__dirname,
				'../../settings/components/statementSettingsForm/StatementSettingsForm.tsx',
			),
			'utf8',
		);
		const start = source.indexOf("t('Results & Decision')");
		const end = source.indexOf("t('AI & Smart Features')");
		const resultsGroup = source.slice(start, end);

		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		expect(resultsGroup).not.toContain('ConfidenceIndexSettings');
		// The form renders People through PeopleSection, which renders it once.
		expect(source.match(/<ConfidenceIndexSettings /g)).toBeNull();
		expect(source.match(/<PeopleSection\b/g)).toHaveLength(1);
		expect(FORM_COMPOSITION.hub.map((e) => e.component)).not.toContain('ConfidenceIndexSettings');
	});
});

describe('PeopleSection › Waiting to join', () => {
	const scrollIntoView = jest.fn();

	beforeAll(() => {
		Element.prototype.scrollIntoView = scrollIntoView;
	});
	beforeEach(() => {
		scrollIntoView.mockClear();
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
			cb(0);

			return 0;
		});
	});
	afterEach(() => jest.restoreAllMocks());

	it('is hidden when nobody waits and access is not By approval', () => {
		renderPeople(makeStatement(StatementType.group, Access.openToAll));

		expect(document.getElementById('waiting')).toBeNull();
	});

	it('shows, collapsed and empty-handed, when access is By approval', () => {
		renderPeople(makeStatement(StatementType.group, Access.moderated));
		const header = screen.getByRole('button', { name: /people\.waiting/ });

		expect(header).toHaveAttribute('aria-expanded', 'false');
		fireEvent.click(header);
		expect(screen.getByText('people.waiting.empty')).toBeTruthy();
	});

	it('opens by default when someone waits for this space only', () => {
		mockedUseApprove.mockReturnValue({ waitingList: [waiting('w1'), waiting('w2', 'elsewhere')] });
		renderPeople(makeStatement(StatementType.group, Access.moderated));

		expect(screen.getByRole('button', { name: /people\.waiting/ })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(screen.getByTestId('waiting-row-w1')).toBeTruthy();
		expect(screen.queryByTestId('waiting-row-w2')).toBeNull();
	});

	it('follows the #waiting deep link: opens, scrolls and focuses the heading', async () => {
		mockedUseApprove.mockReturnValue({ waitingList: [waiting('w1')] });
		await act(async () => {
			renderPeople(makeStatement(StatementType.question), '#waiting');
		});
		const header = screen.getByRole('button', { name: /people\.waiting/ });

		expect(header).toHaveAttribute('aria-expanded', 'true');
		expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
		expect(document.activeElement).toBe(header);
	});

	it('ignores a deep link to a subsection that is not shown', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll), '#waiting');
		});

		expect(scrollIntoView).not.toHaveBeenCalled();
	});
});

describe('PeopleSection › Members', () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = jest.fn();
	});

	it.each([StatementType.question, StatementType.group])(
		'renders one Members subsection, collapsed, for a %s',
		(type) => {
			renderPeople(makeStatement(type, Access.openToAll));
			const header = document.querySelector('#members .people-subsection__header');

			expect(document.querySelectorAll('#members')).toHaveLength(1);
			expect(header).toHaveAttribute('aria-expanded', 'false');
		},
	);

	it('opens from the #members deep link', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll), '#members');
		});

		expect(document.querySelector('#members .people-subsection__header')).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(screen.getByRole('group', { name: 'people.filterMembers' })).toBeTruthy();
	});

	it('Waiting comes before Members', () => {
		renderPeople(makeStatement(StatementType.group, Access.moderated));
		const ids = Array.from(document.querySelectorAll('.people-subsection')).map((el) => el.id);

		expect(ids).toEqual(['waiting', 'members']);
	});
});
