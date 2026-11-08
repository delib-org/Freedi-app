import { describe, expect, it } from 'vitest';
import { pushSupportOf, shouldAskPush, type PushEnvironment } from '../replyPushLogic';

const desktop: PushEnvironment = {
	hasNotification: true,
	hasPushManager: true,
	hasServiceWorker: true,
	ios: false,
	standalone: false,
	permission: 'default',
};

describe('pushSupportOf', () => {
	it('needs Notification, PushManager and service workers', () => {
		expect(pushSupportOf(desktop)).toBe('default');
		expect(pushSupportOf({ ...desktop, hasNotification: false })).toBe('unsupported');
		expect(pushSupportOf({ ...desktop, hasPushManager: false })).toBe('unsupported');
		expect(pushSupportOf({ ...desktop, hasServiceWorker: false })).toBe('unsupported');
	});

	it('on iOS only from the home-screen app', () => {
		expect(pushSupportOf({ ...desktop, ios: true })).toBe('unsupported');
		expect(pushSupportOf({ ...desktop, ios: true, standalone: true })).toBe('default');
	});

	it('reports what the browser already decided', () => {
		expect(pushSupportOf({ ...desktop, permission: 'granted' })).toBe('granted');
		expect(pushSupportOf({ ...desktop, permission: 'denied' })).toBe('denied');
	});
});

describe('shouldAskPush', () => {
	it('asks once, only a device that can still say yes', () => {
		expect(shouldAskPush('default', null)).toBe(true);
		expect(shouldAskPush('default', 'no')).toBe(false);
		expect(shouldAskPush('default', 'yes')).toBe(false);
		expect(shouldAskPush('granted', null)).toBe(false);
		expect(shouldAskPush('denied', null)).toBe(false);
		expect(shouldAskPush('unsupported', null)).toBe(false);
	});
});
