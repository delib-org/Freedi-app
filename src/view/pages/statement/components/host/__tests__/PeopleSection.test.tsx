import * as fs from 'node:fs';
import * as path from 'node:path';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Access, Statement, StatementType, WaitingMember } from '@freedi/shared-types';
import { useApproveMembership } from '@/view/components/approveMembers/WaitingListVM';
import { renderWithProviders } from '@/test-utils/test-utils';
import { countMembers } from '@/controllers/db/membership/membersPage';
import { getUserDemographicResponses } from '@/controllers/db/userDemographic/getUserDemographic';
import type { MemberReviewData } from '@/types/demographics';
import PeopleSection from '../PeopleSection';
import { useJoinQuestionCounts } from '../people/useJoinQuestionCounts';
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
const mockedQuestionCounts = useJoinQuestionCounts as jest.MockedFunction<
	typeof useJoinQuestionCounts
>;
const mockedResponses = getUserDemographicResponses as jest.MockedFunction<
	typeof getUserDemographicResponses
>;
const mockedCountMembers = countMembers as jest.MockedFunction<typeof countMembers>;

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
jest.mock('@/controllers/db/membership/membersPage', () => ({
	countMembers: jest.fn().mockResolvedValue(5),
	loadMembersPage: () => jest.fn().mockResolvedValue(0),
}));
jest.mock('@/controllers/db/userDemographic/getUserDemographic', () => ({
	getUserDemographicResponses: jest.fn().mockResolvedValue([]),
}));
jest.mock('../people/useJoinQuestionCounts', () => ({
	useJoinQuestionCounts: jest.fn(() => ({ asked: 0, isSameAsGroup: false })),
}));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	updateMemberRole: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../settings/components/optionRooms', () => ({
	OptionRooms: () => <div data-testid="rooms" />,
}));
jest.mock('../../settings/components/QuestionSettings/ConfidenceIndexSettings', () =>
	mockStub('stakeholders-setting'),
);

function makeStatement(statementType: StatementType, access?: Access, parentId = 'top'): Statement {
	return {
		membership: access ? { access } : undefined,
		statementId: 's1',
		topParentId: 's1',
		parentId,
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

function review(userId: string, status: MemberReviewData['status']): MemberReviewData {
	return {
		userId,
		user: { uid: userId, displayName: userId },
		responses: [],
		flags: [],
		status,
	} as unknown as MemberReviewData;
}

/** Each subsection's header button, by anchor. */
const header = (anchor: string) =>
	document.querySelector<HTMLButtonElement>(`#${anchor} .people-subsection__header`);
const subsectionIds = () =>
	Array.from(document.querySelectorAll('.people-subsection')).map((el) => el.id);

beforeAll(() => {
	Element.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
	mockedUseApprove.mockReturnValue({ waitingList: [] });
	mockedQuestionCounts.mockReturnValue({ asked: 0, isSameAsGroup: false });
	mockedResponses.mockResolvedValue([]);
	mockedCountMembers.mockResolvedValue(5);
});

describe('PeopleSection › composition (IA §4)', () => {
	it('a group: Who can join · Members · Questions · Stakeholders', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});

		expect(subsectionIds()).toEqual(['join', 'members', 'questions', 'stakeholders']);
	});

	it('adds Waiting (By approval) and Entry check (questions exist) in their places', async () => {
		mockedQuestionCounts.mockReturnValue({ asked: 2, isSameAsGroup: false });
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.moderated));
		});

		expect(subsectionIds()).toEqual([
			'join',
			'waiting',
			'members',
			'questions',
			'entry-check',
			'stakeholders',
		]);
	});

	it('a question adds Joining answers & rooms last', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.question, Access.openToAll));
		});

		expect(subsectionIds()).toEqual(['join', 'members', 'questions', 'stakeholders', 'joining']);
	});

	it('every subsection is h3 > button[aria-expanded][aria-controls], collapsed by default', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.question, Access.openToAll));
		});

		subsectionIds().forEach((id) => {
			const button = header(id);
			expect(button?.parentElement?.tagName).toBe('H3');
			expect(button).toHaveAttribute('aria-expanded', 'false');
			expect(button).toHaveAttribute('aria-controls', `${id}-body`);
		});
	});

	it('renders the stakeholder count once, inside #stakeholders', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group), '#stakeholders');
		});

		expect(screen.getAllByTestId('stakeholders-setting')).toHaveLength(1);
		expect(
			document.querySelector('#stakeholders [data-testid="stakeholders-setting"]'),
		).toBeTruthy();
	});

	it('Results & Decision group no longer composes the stakeholder count', () => {
		const source = fs.readFileSync(
			path.resolve(
				__dirname,
				'../../settings/components/statementSettingsForm/StatementSettingsForm.tsx',
			),
			'utf8',
		);
		const start = source.indexOf("t('Results & Decision')");
		const end = source.indexOf("t('AI & Smart Features')");

		expect(start).toBeGreaterThan(-1);
		expect(source.slice(start, end)).not.toContain('ConfidenceIndexSettings');
		expect(source.match(/<ConfidenceIndexSettings /g)).toBeNull();
		expect(source.match(/<PeopleSection\b/g)).toHaveLength(1);
		expect(FORM_COMPOSITION.hub.map((e) => e.component)).not.toContain('ConfidenceIndexSettings');
	});
});

describe('PeopleSection › summary lines', () => {
	it('Who can join names the level; a sub-space adds "same as the group"', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.question, undefined, 'group-1'));
		});

		expect(header('join')).toHaveTextContent(
			'people.whoCanJoin·people.access.openToAll · people.sameAsGroup',
		);
	});

	it('a top-level space never says "same as the group"', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.moderated));
		});

		expect(header('join')).toHaveTextContent('people.access.byApproval');
		expect(header('join')).not.toHaveTextContent('people.sameAsGroup');
		expect(header('stakeholders')).toHaveTextContent('people.notSetAnywhere');
	});

	it('Questions: count, and "same as the group" when inherited as is', async () => {
		mockedQuestionCounts.mockReturnValue({ asked: 2, isSameAsGroup: true });
		await act(async () => {
			renderPeople(makeStatement(StatementType.question, undefined, 'group-1'));
		});

		expect(header('questions')).toHaveTextContent('people.summary.questions · people.sameAsGroup');
	});

	it('Entry check carries a count badge only when answers wait for review', async () => {
		mockedQuestionCounts.mockReturnValue({ asked: 1, isSameAsGroup: false });
		mockedResponses.mockResolvedValue([review('a', 'pending'), review('b', 'approved')]);
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});

		expect(document.querySelector('#entry-check .people-subsection__count')).toHaveTextContent('1');
		expect(document.querySelector('#members .people-subsection__count')).toBeNull();
	});
});

describe('PeopleSection › default open (UX 4.1)', () => {
	it('opens Waiting first when someone waits for this space only', async () => {
		mockedUseApprove.mockReturnValue({ waitingList: [waiting('w1'), waiting('w2', 'elsewhere')] });
		mockedQuestionCounts.mockReturnValue({ asked: 1, isSameAsGroup: false });
		mockedResponses.mockResolvedValue([review('a', 'pending')]);
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.moderated));
		});

		expect(header('waiting')).toHaveAttribute('aria-expanded', 'true');
		expect(header('entry-check')).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getByTestId('waiting-row-w1')).toBeTruthy();
		expect(screen.queryByTestId('waiting-row-w2')).toBeNull();
	});

	it('else Entry check when answers wait for review', async () => {
		mockedQuestionCounts.mockReturnValue({ asked: 1, isSameAsGroup: false });
		mockedResponses.mockResolvedValue([review('a', 'pending')]);
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});

		expect(header('entry-check')).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByTestId('validation')).toBeTruthy();
	});

	it('else Who can join on a brand-new space', async () => {
		mockedCountMembers.mockResolvedValue(1);
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});

		expect(header('join')).toHaveAttribute('aria-expanded', 'true');
	});

	it('else nothing', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});

		subsectionIds().forEach((id) => expect(header(id)).toHaveAttribute('aria-expanded', 'false'));
	});
});

describe('PeopleSection › anchors', () => {
	const scrollIntoView = jest.fn();

	beforeEach(() => {
		Element.prototype.scrollIntoView = scrollIntoView;
		scrollIntoView.mockClear();
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
			cb(0);

			return 0;
		});
	});
	afterEach(() => jest.restoreAllMocks());

	it('Waiting is hidden when nobody waits and access is not By approval', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});

		expect(document.getElementById('waiting')).toBeNull();
	});

	it('Waiting shows, collapsed and empty-handed, when access is By approval', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.moderated));
		});

		expect(header('waiting')).toHaveAttribute('aria-expanded', 'false');
		fireEvent.click(header('waiting') as HTMLButtonElement);
		expect(screen.getByText('people.waiting.empty')).toBeTruthy();
	});

	it('follows the #waiting deep link: opens, scrolls and focuses the heading', async () => {
		mockedUseApprove.mockReturnValue({ waitingList: [waiting('w1')] });
		await act(async () => {
			renderPeople(makeStatement(StatementType.question), '#waiting');
		});

		expect(header('waiting')).toHaveAttribute('aria-expanded', 'true');
		expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
		expect(document.activeElement).toBe(header('waiting'));
	});

	it('opens Members from the #members deep link', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll), '#members');
		});

		expect(header('members')).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByRole('group', { name: 'people.filterMembers' })).toBeTruthy();
	});

	it('ignores a deep link to a subsection that is not shown', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll), '#joining');
		});

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it('the jump strip lists the visible subsections as buttons; a chip opens, scrolls and focuses', async () => {
		await act(async () => {
			renderPeople(makeStatement(StatementType.group, Access.openToAll));
		});
		const strip = screen.getByRole('navigation', { name: 'people.sections' });
		const chips = Array.from(strip.querySelectorAll('button')).map((b) => b.textContent);

		expect(chips).toEqual([
			'people.whoCanJoin',
			'people.members5',
			'people.joinQuestions0',
			'host.people.stakeholders',
		]);
		fireEvent.click(screen.getByRole('button', { name: /^host\.people\.stakeholders$/ }));
		expect(header('stakeholders')).toHaveAttribute('aria-expanded', 'true');
		expect(document.activeElement).toBe(header('stakeholders'));
	});
});

describe('PeopleSection › live region', () => {
	it('is one polite region that announces a change in the waiting count', async () => {
		mockedUseApprove.mockReturnValue({ waitingList: [waiting('w1')] });
		const view = await act(async () =>
			renderPeople(makeStatement(StatementType.group, Access.moderated)),
		);

		expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
		expect(screen.getByTestId('people-live')).toHaveTextContent('');

		mockedUseApprove.mockReturnValue({ waitingList: [waiting('w1'), waiting('w2')] });
		await act(async () => {
			view.rerender(
				<MemoryRouter initialEntries={['/statement-screen/s1/settings?section=people']}>
					<PeopleSection
						statement={makeStatement(StatementType.group, Access.moderated)}
						setStatementToEdit={jest.fn()}
					/>
				</MemoryRouter>,
			);
		});

		expect(screen.getByTestId('people-live')).toHaveTextContent('people.waitingCount');
	});
});
