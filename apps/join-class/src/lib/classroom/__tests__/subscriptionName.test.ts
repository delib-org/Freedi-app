import { describe, expect, it } from 'vitest';
import { resolveSubscriptionName } from '../subscriptionName';

describe('resolveSubscriptionName', () => {
	it('prefers the Firebase name', () => {
		expect(resolveSubscriptionName({ displayName: ' Dana ', isAnonymous: false }, 'Lee')).toBe(
			'Dana',
		);
	});

	it('uses the name typed on this device for an anonymous student', () => {
		expect(resolveSubscriptionName({ displayName: null, isAnonymous: true }, ' Lee ')).toBe('Lee');
	});

	it('is empty when nothing is known', () => {
		expect(resolveSubscriptionName({ displayName: '', isAnonymous: true }, null)).toBe('');
		expect(resolveSubscriptionName(null, null)).toBe('');
	});

	it('ignores the device name for a signed-in account', () => {
		expect(resolveSubscriptionName({ displayName: null, isAnonymous: false }, 'Lee')).toBe('');
	});
});
