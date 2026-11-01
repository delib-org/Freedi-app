import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Access, Statement, StatementType } from '@freedi/shared-types';
import { renderWithProviders } from '@/test-utils/test-utils';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';
import { logError } from '@/utils/errorHandling';
import MembershipSettings from '../MembershipSettings';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/controllers/db/statements/setStatementMembership', () => ({
	setStatementMembership: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockedSave = setStatementMembership as jest.MockedFunction<typeof setStatementMembership>;

function makeStatement(): Statement {
	return {
		statementId: 'g1',
		topParentId: 'g1',
		parentId: 'top',
		statement: 'Group',
		statementType: StatementType.group,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		membership: { access: Access.openToAll },
	} as Statement;
}

describe('MembershipSettings', () => {
	beforeEach(() => jest.clearAllMocks());

	it('shows one label per access level', () => {
		renderWithProviders(
			<MembershipSettings statement={makeStatement()} setStatementToEdit={jest.fn()} />,
		);

		[
			'people.access.public',
			'people.access.openToAll',
			'people.access.signedIn',
			'people.access.byApproval',
			'people.access.inviteOnly',
		].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
		expect(screen.getByText('people.whoCanJoin')).toBeTruthy();
	});

	it('saves the chosen level without an error note', async () => {
		mockedSave.mockResolvedValue();
		renderWithProviders(
			<MembershipSettings statement={makeStatement()} setStatementToEdit={jest.fn()} />,
		);

		fireEvent.click(screen.getByRole('button', { name: /people\.access\.byApproval/ }));

		await waitFor(() =>
			expect(mockedSave).toHaveBeenCalledWith(
				expect.objectContaining({ membershipAccess: Access.moderated }),
			),
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('shows an inline error and logs with context when the save fails', async () => {
		mockedSave.mockRejectedValue(new Error('permission-denied'));
		renderWithProviders(
			<MembershipSettings statement={makeStatement()} setStatementToEdit={jest.fn()} />,
		);

		fireEvent.click(screen.getByRole('button', { name: /people\.access\.inviteOnly/ }));

		expect(await screen.findByRole('alert')).toHaveTextContent('people.error.save');
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'membershipSettings.MembershipSettings.saveAccess',
				statementId: 'g1',
			}),
		);
	});
});
