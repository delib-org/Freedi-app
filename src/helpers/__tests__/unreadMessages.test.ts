import { computeUnreadMessages } from '../unreadMessages';

describe('computeUnreadMessages', () => {
	it('is the counter minus what was seen', () => {
		expect(computeUnreadMessages(12, { seenMessageCount: 9 })).toBe(3);
	});

	it('shows nothing for a card the person never opened (no subscription)', () => {
		expect(computeUnreadMessages(12, undefined)).toBe(0);
	});

	it('counts a subscription without a marker as 0 seen', () => {
		expect(computeUnreadMessages(4, {})).toBe(4);
	});

	it('is 0 when nothing was counted yet (before the deploy)', () => {
		expect(computeUnreadMessages(undefined, { seenMessageCount: 0 })).toBe(0);
		expect(computeUnreadMessages(undefined, {})).toBe(0);
	});

	it('never goes below 0, for example after a delete', () => {
		expect(computeUnreadMessages(8, { seenMessageCount: 10 })).toBe(0);
	});

	it('is 0 when everything was seen', () => {
		expect(computeUnreadMessages(7, { seenMessageCount: 7 })).toBe(0);
	});
});
