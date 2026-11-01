import { WaitingMember } from '@freedi/shared-types';
import { approveMembership, returnToWaiting } from '@/controllers/db/membership/setMembership';
import { approveMultiple, rejectMultiple, returnMultipleToWaiting } from '../membershipActions';

jest.mock('@/controllers/db/membership/setMembership', () => ({
	approveMembership: jest.fn(),
	returnToWaiting: jest.fn(),
}));

const mockedApprove = approveMembership as jest.MockedFunction<typeof approveMembership>;
const mockedReturn = returnToWaiting as jest.MockedFunction<typeof returnToWaiting>;

const member = (id: string): WaitingMember =>
	({ statementsSubscribeId: id, userId: `u-${id}`, statementId: 's1' }) as WaitingMember;

describe('membershipActions', () => {
	beforeEach(() => jest.clearAllMocks());

	it('lets every member in and reports no failures', async () => {
		mockedApprove.mockResolvedValue(undefined);
		const members = [member('a'), member('b')];

		await expect(approveMultiple(members)).resolves.toEqual([]);
		expect(mockedApprove).toHaveBeenCalledWith(members[0], true);
		expect(mockedApprove).toHaveBeenCalledWith(members[1], true);
	});

	it('declines without asking the browser to confirm', async () => {
		const confirmSpy = jest.spyOn(window, 'confirm');
		mockedApprove.mockResolvedValue(undefined);

		await rejectMultiple([member('a')]);

		expect(mockedApprove).toHaveBeenCalledWith(member('a'), false);
		expect(confirmSpy).not.toHaveBeenCalled();
		confirmSpy.mockRestore();
	});

	it('returns exactly the members whose write failed', async () => {
		mockedApprove.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));

		const failed = await approveMultiple([member('a'), member('b')]);

		expect(failed.map((m) => m.statementsSubscribeId)).toEqual(['b']);
	});

	it('puts members back on the waiting list for Undo', async () => {
		mockedReturn.mockResolvedValue(undefined);

		await expect(returnMultipleToWaiting([member('a')])).resolves.toEqual([]);
		expect(mockedReturn).toHaveBeenCalledWith(member('a'));
	});
});
