import { renderHook, act } from '@testing-library/react';
import { useReadVisibleNotifications } from '../useReadVisibleNotifications';
import {
	markMultipleNotificationsAsReadDB,
	markStatementNotificationsAsReadDB,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { NOTIFICATION } from '@/constants/common';

let mockExtraUnread: Array<Record<string, unknown>> = [];

jest.mock('@/controllers/db/inAppNotifications/db_inAppNotifications', () => ({
	markMultipleNotificationsAsReadDB: jest.fn().mockResolvedValue(undefined),
	markStatementNotificationsAsReadDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../reduxHooks', () => ({
	useAppSelector: (selector: (state: unknown) => unknown) =>
		selector({
			creator: { creator: { uid: 'one' } },
			notifications: {
				inAppNotifications: [
					{
						userId: 'one',
						creatorId: 'two',
						notificationId: 'n1',
						statementId: 'reply',
						parentId: 'room',
						read: false,
					},
					{
						userId: 'one',
						creatorId: 'two',
						notificationId: 'n2',
						statementId: 'not-visible',
						parentId: 'room',
						read: false,
					},
					...mockExtraUnread,
				],
			},
		}),
}));
let intersect: IntersectionObserverCallback;
let target: HTMLDivElement;
beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	mockExtraUnread = [];
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	global.IntersectionObserver = jest.fn((callback) => {
		intersect = callback;

		return { observe: jest.fn(), disconnect: jest.fn(), unobserve: jest.fn() };
	}) as unknown as typeof IntersectionObserver;
	target = document.createElement('div');
	target.setAttribute('data-contribution-id', 'reply');
	document.body.appendChild(target);
});
afterEach(() => {
	target.remove();
	jest.useRealTimers();
});
function show(isIntersecting: boolean) {
	act(() =>
		intersect(
			[
				{
					target,
					isIntersecting,
					boundingClientRect: target.getBoundingClientRect(),
					intersectionRatio: isIntersecting ? 1 : 0,
					intersectionRect: target.getBoundingClientRect(),
					rootBounds: null,
					time: 0,
				},
			],
			{} as IntersectionObserver,
		),
	);
}
it('marks only a visible contribution after two seconds', () => {
	renderHook(() => useReadVisibleNotifications(document.body, 'room'));
	show(true);
	act(() => jest.advanceTimersByTime(1999));
	expect(markMultipleNotificationsAsReadDB).not.toHaveBeenCalled();
	act(() => jest.advanceTimersByTime(1));
	expect(markMultipleNotificationsAsReadDB).toHaveBeenCalledWith(['n1']);
});
it('does not read messages scrolled away or in a hidden app', () => {
	renderHook(() => useReadVisibleNotifications(document.body, 'room'));
	show(true);
	show(false);
	act(() => jest.advanceTimersByTime(2000));
	expect(markMultipleNotificationsAsReadDB).not.toHaveBeenCalled();
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
	show(true);
	act(() => jest.advanceTimersByTime(2000));
	expect(markMultipleNotificationsAsReadDB).not.toHaveBeenCalled();
});
it('leaves the question to visibility alone while the backlog is small', () => {
	renderHook(() => useReadVisibleNotifications(document.body, 'room'));
	act(() => jest.advanceTimersByTime(NOTIFICATION.READ_RECEIPT_DELAY_MS));
	expect(markStatementNotificationsAsReadDB).not.toHaveBeenCalled();
});
it('clears the question by query when the bounded feed is full', () => {
	mockExtraUnread = Array.from({ length: NOTIFICATION.UNREAD_LISTENER_LIMIT }, (_, i) => ({
		userId: 'one',
		creatorId: 'two',
		notificationId: `elsewhere-${i}`,
		statementId: `elsewhere-${i}`,
		parentId: 'other-room',
		read: false,
	}));
	renderHook(() => useReadVisibleNotifications(document.body, 'room'));
	act(() => jest.advanceTimersByTime(NOTIFICATION.READ_RECEIPT_DELAY_MS - 1));
	expect(markStatementNotificationsAsReadDB).not.toHaveBeenCalled();
	act(() => jest.advanceTimersByTime(1));
	expect(markStatementNotificationsAsReadDB).toHaveBeenCalledWith('room');
});
