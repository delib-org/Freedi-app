import { renderHook } from '@testing-library/react';
import { useBadgeSync } from '../useBadgeSync';

let auth = { user: { uid: 'one' } as { uid: string } | null, isLoading: false };
let owner: string | undefined;
const notifications = [
	{ userId: 'one', creatorId: 'two', read: false, statementId: 'reply', notificationId: 'n1' },
];
jest.mock('../useAuthentication', () => ({ useAuthentication: () => auth }));
jest.mock('react-redux', () => ({
	useSelector: (selector: (state: unknown) => unknown) =>
		selector({ notifications: { inAppNotifications: notifications, loadedForUser: owner } }),
}));
jest.mock('../../../../public/badge-store.js', () => {});
beforeEach(() => {
	owner = undefined;
	auth = { user: { uid: 'one' }, isLoading: false };
	globalThis.FreeDiBadgeStore = {
		update: jest.fn().mockResolvedValue({ count: 1 }),
		apply: jest.fn().mockResolvedValue(undefined),
	};
});
it('preserves the background badge until this user has a loaded feed', async () => {
	const { rerender } = renderHook(() => useBadgeSync());
	await Promise.resolve();
	expect(globalThis.FreeDiBadgeStore.update).not.toHaveBeenCalled();
	owner = 'one';
	rerender();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(globalThis.FreeDiBadgeStore.update).toHaveBeenCalledWith(
		expect.objectContaining({
			count: 1,
			userId: 'one',
			notificationIds: ['n1', 'statement:reply'],
		}),
	);
	expect(globalThis.FreeDiBadgeStore.apply).toHaveBeenCalledWith(1);
});
it('clears the badge only once sign-out is confirmed', async () => {
	auth = { user: null, isLoading: true };
	const { rerender } = renderHook(() => useBadgeSync());
	await Promise.resolve();
	expect(globalThis.FreeDiBadgeStore.apply).not.toHaveBeenCalled();
	auth = { user: null, isLoading: false };
	rerender();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(globalThis.FreeDiBadgeStore.update).toHaveBeenCalledWith(
		expect.objectContaining({ count: 0, userId: null }),
	);
});
