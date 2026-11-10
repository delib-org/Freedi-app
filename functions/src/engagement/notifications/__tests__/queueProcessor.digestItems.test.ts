import { NotificationQueueStatus } from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../channelRouter', () => ({ routeToChannels: jest.fn() }));

const mockDeliver = jest.fn(async () => undefined);
jest.mock('../../../notifications/largeQuestionDigestDelivery', () => ({
	isLargeQuestionDigestItem: (id: string) => id.startsWith('largeQuestionDigestItem_'),
	deliverDigestItem: (id: string) => (mockDeliver as jest.Mock)(id),
}));

const mockDigestUpdate = jest.fn(async () => undefined);
const mockOtherUpdate = jest.fn(async () => undefined);
const mockStuckDocs = [
	{
		id: 'largeQuestionDigestItem_u1_q1_1',
		ref: { update: mockDigestUpdate },
		data: () => ({ createdAt: 1 }),
	},
	{ id: 'daily_u1_1', ref: { update: mockOtherUpdate }, data: () => ({ createdAt: 1 }) },
];

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: () => ({
			where: (_field: string, _op: string, status: string) => ({
				limit: () => ({
					get: async () => ({ docs: status === 'processing' ? mockStuckDocs : [] }),
				}),
			}),
		}),
	}),
}));

import { processPendingQueueItems, processQueueItem } from '../queueProcessor';

describe('queue processor and large-question digest items', () => {
	it('hands a digest item to its own delivery', async () => {
		await processQueueItem('largeQuestionDigestItem_u1_q1_1', {
			status: NotificationQueueStatus.PENDING,
		} as Parameters<typeof processQueueItem>[1]);

		expect(mockDeliver).toHaveBeenCalledWith('largeQuestionDigestItem_u1_q1_1');
	});

	it('the manual endpoint resets other stuck items but never a digest item', async () => {
		await processPendingQueueItems();

		expect(mockOtherUpdate).toHaveBeenCalledTimes(1);
		expect(mockDigestUpdate).not.toHaveBeenCalled();
	});
});
