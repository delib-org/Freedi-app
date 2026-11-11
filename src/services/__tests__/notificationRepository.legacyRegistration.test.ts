/**
 * askedToBeNotified is legacy and owner-only, so on a shared browser the write
 * can be refused. Registration still counts: push is delivered from pushNotifications.
 */

const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockRemoveToken = jest.fn();
const mockLogError = jest.fn();

jest.mock('firebase/firestore', () => ({
	doc: jest.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
	getDoc: jest.fn(),
	getDocs: jest.fn(),
	query: jest.fn(),
	where: jest.fn(),
	collection: jest.fn(),
	writeBatch: jest.fn(),
	Timestamp: class {},
}));

jest.mock('@/controllers/db/config', () => ({ DB: {}, auth: { currentUser: { uid: 'user-b' } } }));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	removeTokenFromSubscription: (...args: unknown[]) => mockRemoveToken(...args),
}));
jest.mock('@/utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));
jest.mock('../platformService', () => ({ getDeviceInfo: jest.fn(() => ({ platform: 'web' })) }));

import {
	registerForStatementNotifications,
	unregisterFromStatementNotifications,
} from '../notificationRepository';

const denied = Object.assign(new Error('Missing or insufficient permissions'), {
	code: 'permission-denied',
});

describe('notificationRepository legacy askedToBeNotified', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRemoveToken.mockResolvedValue(undefined);
		mockSetDoc.mockResolvedValue(undefined);
		mockDeleteDoc.mockResolvedValue(undefined);
	});

	describe('registerForStatementNotifications', () => {
		it('registers the device in pushNotifications, then the legacy doc, and never a subscription', async () => {
			await registerForStatementNotifications('user-b', 'tok', 'st-1');

			const paths = mockSetDoc.mock.calls.map(([ref]) => (ref as { path: string }).path);
			expect(paths).toEqual(['pushNotifications/tok', 'askedToBeNotified/tok_st-1']);
			expect(mockSetDoc).toHaveBeenCalledWith(
				{ path: 'askedToBeNotified/tok_st-1' },
				expect.objectContaining({ token: 'tok', userId: 'user-b', statementId: 'st-1' }),
				{ merge: true },
			);
		});

		it('still resolves when the shared-browser legacy doc belongs to someone else', async () => {
			mockSetDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(denied);

			await expect(
				registerForStatementNotifications('user-b', 'tok', 'st-1'),
			).resolves.toBeUndefined();
			expect(mockSetDoc).toHaveBeenCalledTimes(2);
			expect(mockLogError).not.toHaveBeenCalled();
		});

		it('rethrows any other failure of the legacy write', async () => {
			const unavailable = Object.assign(new Error('offline'), { code: 'unavailable' });
			mockSetDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(unavailable);

			await expect(registerForStatementNotifications('user-b', 'tok', 'st-1')).rejects.toBe(
				unavailable,
			);
		});
	});

	describe('unregisterFromStatementNotifications', () => {
		it('removes from tokens[] and deletes the legacy doc', async () => {
			await unregisterFromStatementNotifications('tok', 'st-1', 'user-b');

			expect(mockRemoveToken).toHaveBeenCalledWith('st-1', 'user-b', 'tok');
			expect(mockDeleteDoc).toHaveBeenCalledWith({ path: 'askedToBeNotified/tok_st-1' });
		});

		it('stays quiet when the legacy doc belongs to someone else', async () => {
			mockDeleteDoc.mockRejectedValue(denied);

			await expect(
				unregisterFromStatementNotifications('tok', 'st-1', 'user-b'),
			).resolves.toBeUndefined();
			expect(mockLogError).not.toHaveBeenCalled();
		});

		it('logs any other failure with context', async () => {
			const unavailable = Object.assign(new Error('offline'), { code: 'unavailable' });
			mockDeleteDoc.mockRejectedValue(unavailable);

			await unregisterFromStatementNotifications('tok', 'st-1', 'user-b');

			expect(mockLogError).toHaveBeenCalledWith(
				unavailable,
				expect.objectContaining({
					operation: 'services.notificationRepository.unregisterFromStatementNotifications',
				}),
			);
		});
	});
});
