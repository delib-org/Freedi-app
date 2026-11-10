import { NotificationChannel, type RoutableQueueItem } from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));
jest.mock('../../../notifications/notificationEmail', () => ({ sendNotificationEmail: jest.fn() }));

const mockSend = jest.fn(async () => 'id');
jest.mock('firebase-admin', () => ({ messaging: () => ({ send: mockSend }) }));

const mockTokenQuery = jest.fn(async () => ({
	empty: false,
	docs: [{ data: () => ({ token: 'stored-token' }) }],
}));
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: () => ({ where: () => ({ get: mockTokenQuery }) }),
	}),
}));

import { routeToChannels } from '../channelRouter';

function item(extra: Partial<RoutableQueueItem> = {}): RoutableQueueItem {
	return {
		queueItemId: 'q',
		userId: 'u1',
		title: 't',
		body: 'b',
		channels: [NotificationChannel.PUSH],
		targetPath: '/',
		...extra,
	} as RoutableQueueItem;
}

const sentTokens = () =>
	(mockSend.mock.calls as unknown as Array<[{ token: string }]>).map(([message]) => message.token);

describe('routeToChannels push tokens', () => {
	beforeEach(() => {
		mockSend.mockClear();
		mockTokenQuery.mockClear();
	});

	it('sends to tokens the caller resolved, without looking any up', async () => {
		await routeToChannels(item({ pushTokens: ['resolved-1', 'resolved-2'] }));

		expect(sentTokens()).toEqual(['resolved-1', 'resolved-2']);
		expect(mockTokenQuery).not.toHaveBeenCalled();
	});

	it('looks tokens up as before for every other queue item', async () => {
		await routeToChannels(item());

		expect(sentTokens()).toEqual(['stored-token']);
		expect(mockTokenQuery).toHaveBeenCalledTimes(1);
	});
});
