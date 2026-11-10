import {
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	Role,
	SourceApp,
	type NotificationQueueItem,
} from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockRoute = jest.fn(async () => [{ channel: 'in_app', success: true }]);
jest.mock('../channelRouter', () => ({
	routeToChannels: (...args: unknown[]) => (mockRoute as jest.Mock)(...args),
}));
jest.mock('../../../notifications/largeQuestionDigestDelivery', () => ({
	isLargeQuestionDigestItem: () => false,
	deliverDigestItem: jest.fn(),
}));

let mockRoles: Record<string, Role> = {};
const mockReads: string[] = [];
let mockReadFails = false;
const mockUpdate = jest.fn(async (_data: Record<string, unknown>) => undefined);

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: () => ({
			doc: (id: string) => ({ id, update: mockUpdate }),
		}),
		getAll: async (...refs: Array<{ id: string }>) => {
			if (mockReadFails) throw new Error('read failed');
			mockReads.push(...refs.map((ref) => ref.id));

			return refs.map((ref) => ({
				data: () => (mockRoles[ref.id] ? { role: mockRoles[ref.id] } : undefined),
			}));
		},
	}),
}));

import { processQueueItem } from '../queueProcessor';

const USER = 'author';

function item(extra: Partial<NotificationQueueItem> = {}): NotificationQueueItem {
	return {
		queueItemId: 'social_a1_5',
		userId: USER,
		title: 'title',
		body: 'body',
		channels: [NotificationChannel.IN_APP],
		sourceApp: SourceApp.MAIN,
		targetPath: '/statement/q1',
		deliverAt: null,
		frequency: NotificationFrequency.INSTANT,
		triggerType: NotificationTriggerType.SOCIAL_PROOF,
		statementId: 'a1',
		parentId: 'q1',
		topParentId: 'g1',
		status: NotificationQueueStatus.PENDING,
		createdAt: 1,
		...extra,
	};
}

function lastStatus(): unknown {
	const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1];

	return lastCall?.[0].status;
}

describe('queue delivery re-checks the recipient', () => {
	beforeEach(() => {
		mockRoles = {};
		mockReads.length = 0;
		mockReadFails = false;
		mockRoute.mockClear();
		mockUpdate.mockClear();
	});

	it.each([Role.banned, Role.waiting])(
		'skips someone who became %s on the question',
		async (role) => {
			mockRoles = { [`${USER}--q1`]: role };

			await processQueueItem('social_a1_5', item());

			expect(mockRoute).not.toHaveBeenCalled();
			expect(lastStatus()).toBe(NotificationQueueStatus.SKIPPED);
		},
	);

	it('skips someone banned on the top statement', async () => {
		mockRoles = { [`${USER}--g1`]: Role.banned };

		await processQueueItem('social_a1_5', item());

		expect(mockRoute).not.toHaveBeenCalled();
		expect(lastStatus()).toBe(NotificationQueueStatus.SKIPPED);
	});

	it('delivers to someone only waiting on the top statement', async () => {
		mockRoles = { [`${USER}--q1`]: Role.member, [`${USER}--g1`]: Role.waiting };

		await processQueueItem('social_a1_5', item());

		expect(mockRoute).toHaveBeenCalledTimes(1);
		expect(lastStatus()).toBe(NotificationQueueStatus.SENT);
	});

	it('delivers to a member and to someone with no subscription', async () => {
		mockRoles = { [`${USER}--q1`]: Role.member };
		await processQueueItem('social_a1_5', item());
		mockRoles = {};
		await processQueueItem('social_a1_5', item());

		expect(mockRoute).toHaveBeenCalledTimes(2);
	});

	it('reads nothing for a notice about no statement', async () => {
		await processQueueItem(
			'badge_1',
			item({ statementId: undefined, parentId: undefined, topParentId: undefined }),
		);

		expect(mockReads).toEqual([]);
		expect(mockRoute).toHaveBeenCalledTimes(1);
	});

	it('ignores the "top" placeholder', async () => {
		await processQueueItem(
			'decided_q1_u',
			item({ statementId: 'q1', parentId: 'top', topParentId: 'q1' }),
		);

		expect(mockReads).toEqual([`${USER}--q1`]);
	});

	it('sends nothing when the role cannot be read', async () => {
		mockReadFails = true;

		await processQueueItem('social_a1_5', item());

		expect(mockRoute).not.toHaveBeenCalled();
		expect(lastStatus()).toBe(NotificationQueueStatus.FAILED);
	});
});
