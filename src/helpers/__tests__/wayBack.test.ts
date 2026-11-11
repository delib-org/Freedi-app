import { getWayBackPath } from '../wayBack';

describe('getWayBackPath', () => {
	it('returns the statement page the person came from', () => {
		expect(getWayBackPath('/statement/q1?tab=chat', '/statement/group')).toBe(
			'/statement/q1?tab=chat',
		);
		expect(getWayBackPath('/statement-screen/q1/settings', '/statement/group')).toBe(
			'/statement-screen/q1/settings',
		);
	});

	it('offers nothing when the person came from the closed page itself', () => {
		expect(getWayBackPath('/statement/q1', '/statement/q1?tab=chat')).toBeUndefined();
	});

	it('offers nothing for a page that is not a statement', () => {
		expect(getWayBackPath('/home', '/statement/group')).toBeUndefined();
		expect(getWayBackPath(undefined, '/statement/group')).toBeUndefined();
	});

	it('offers nothing for an unsafe target', () => {
		expect(getWayBackPath('//evil.com/statement/q1', '/statement/group')).toBeUndefined();
	});
});
