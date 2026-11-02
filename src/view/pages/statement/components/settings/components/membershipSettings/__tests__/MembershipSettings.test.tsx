import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Access, Statement, StatementType } from '@freedi/shared-types';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';
import { logError } from '@/utils/errorHandling';
import MembershipSettings from '../MembershipSettings';

const mockStatements: Record<string, Statement> = {};
const mockDispatch = jest.fn();

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
	useAppDispatch: () => mockDispatch,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: (id: string | undefined) => () => (id ? mockStatements[id] : undefined),
	clearStatementFields: (payload: unknown) => ({ type: 'clearStatementFields', payload }),
}));
jest.mock('@/controllers/db/statements/setStatementMembership', () => ({
	setStatementMembership: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockedSave = setStatementMembership as jest.MockedFunction<typeof setStatementMembership>;

function makeStatement(overrides: Partial<Statement> = {}): Statement {
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
		...overrides,
	} as Statement;
}

const group = makeStatement({ membership: { access: Access.moderated } });
const question = (access?: Access): Statement =>
	makeStatement({
		statementId: 'q1',
		parentId: 'g1',
		statementType: StatementType.question,
		membership: access ? { access } : undefined,
	});

describe('MembershipSettings', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStatements.g1 = group;
	});

	describe('on a top-level space', () => {
		it('shows the access picker alone, one radio per level', () => {
			render(<MembershipSettings statement={makeStatement()} setStatementToEdit={jest.fn()} />);

			expect(screen.queryByRole('button', { name: 'people.sameAsGroup' })).toBeNull();
			expect(screen.getByRole('group', { name: 'people.whoCanJoin' }).tagName).toBe('FIELDSET');
			[
				'people.access.public',
				'people.access.openToAll',
				'people.access.signedIn',
				'people.access.byApproval',
				'people.access.inviteOnly',
			].forEach((label) => expect(screen.getByRole('radio', { name: label })).toBeTruthy());
			expect(screen.getByRole('radio', { name: 'people.access.openToAll' })).toBeChecked();
		});

		it('saves the chosen level without an error note', async () => {
			mockedSave.mockResolvedValue();
			render(<MembershipSettings statement={makeStatement()} setStatementToEdit={jest.fn()} />);

			fireEvent.click(screen.getByRole('radio', { name: 'people.access.byApproval' }));

			await waitFor(() =>
				expect(mockedSave).toHaveBeenCalledWith(
					expect.objectContaining({ membershipAccess: Access.moderated }),
				),
			);
			expect(screen.queryByRole('alert')).toBeNull();
		});

		it('shows an inline error, restores the level and logs with context when the save fails', async () => {
			mockedSave.mockRejectedValue(new Error('permission-denied'));
			render(<MembershipSettings statement={makeStatement()} setStatementToEdit={jest.fn()} />);

			fireEvent.click(screen.getByRole('radio', { name: 'people.access.inviteOnly' }));

			expect(await screen.findByRole('alert')).toHaveTextContent('people.error.save');
			expect(screen.getByRole('radio', { name: 'people.access.openToAll' })).toBeChecked();
			expect(logError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({
					operation: 'membershipSettings.MembershipSettings.saveAccess',
					statementId: 'g1',
				}),
			);
		});
	});

	describe('on a question', () => {
		it('starts inherited: group value checked, radios read-only, caption names it', () => {
			render(<MembershipSettings statement={question()} setStatementToEdit={jest.fn()} />);

			expect(screen.getByRole('button', { name: 'people.sameAsGroup' })).toHaveAttribute(
				'aria-pressed',
				'true',
			);
			expect(screen.getByText('people.groupIs')).toBeTruthy();
			const approval = screen.getByRole('radio', { name: 'people.access.byApproval' });
			expect(approval).toBeChecked();
			expect(approval).toBeDisabled();
		});

		it('reads the deprecated open as inherited', () => {
			render(
				<MembershipSettings statement={question(Access.open)} setStatementToEdit={jest.fn()} />,
			);

			expect(screen.getByRole('button', { name: 'people.sameAsGroup' })).toHaveAttribute(
				'aria-pressed',
				'true',
			);
		});

		it('goes inherited → override → back, writing the level then clearing it', async () => {
			mockedSave.mockResolvedValue();
			render(<MembershipSettings statement={question()} setStatementToEdit={jest.fn()} />);

			fireEvent.click(screen.getByRole('button', { name: 'people.changeHere' }));
			await waitFor(() =>
				expect(mockedSave).toHaveBeenLastCalledWith(
					expect.objectContaining({ membershipAccess: Access.moderated }),
				),
			);
			const secret = screen.getByRole('radio', { name: 'people.access.inviteOnly' });
			expect(secret).toBeEnabled();

			fireEvent.click(secret);
			await waitFor(() =>
				expect(mockedSave).toHaveBeenLastCalledWith(
					expect.objectContaining({ membershipAccess: Access.secret }),
				),
			);

			fireEvent.click(screen.getByRole('button', { name: 'people.sameAsGroup' }));
			await waitFor(() =>
				expect(mockedSave).toHaveBeenLastCalledWith(
					expect.objectContaining({ membershipAccess: null }),
				),
			);
			expect(screen.getByRole('radio', { name: 'people.access.byApproval' })).toBeChecked();
			expect(screen.getByRole('radio', { name: 'people.access.byApproval' })).toBeDisabled();
			await waitFor(() =>
				expect(mockDispatch).toHaveBeenCalledWith({
					type: 'clearStatementFields',
					payload: { statementId: 'q1', fields: ['membership'] },
				}),
			);
		});
	});

	it('drops membership from a draft when it goes back to the group', () => {
		const setStatementToEdit = jest.fn();
		const draft = { ...question(Access.secret), statementId: '' };
		render(<MembershipSettings statement={draft} setStatementToEdit={setStatementToEdit} />);

		fireEvent.click(screen.getByRole('button', { name: 'people.sameAsGroup' }));

		expect(mockedSave).not.toHaveBeenCalled();
		expect(setStatementToEdit.mock.calls[0][0]).not.toHaveProperty('membership');
	});
});
