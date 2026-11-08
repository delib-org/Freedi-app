import { computeFirstRunSteps } from '../useFirstRunSteps';

describe('computeFirstRunSteps', () => {
	it('always starts with terms', () => {
		expect(
			computeFirstRunSteps({
				notificationSupported: false,
				permission: undefined,
				iosNotInstalled: false,
			}),
		).toEqual(['terms']);
	});

	it('adds notifications only while the browser can still ask', () => {
		expect(
			computeFirstRunSteps({
				notificationSupported: true,
				permission: 'default',
				iosNotInstalled: false,
			}),
		).toEqual(['terms', 'notifications']);
		expect(
			computeFirstRunSteps({
				notificationSupported: true,
				permission: 'granted',
				iosNotInstalled: false,
			}),
		).toEqual(['terms']);
		expect(
			computeFirstRunSteps({
				notificationSupported: true,
				permission: 'denied',
				iosNotInstalled: false,
			}),
		).toEqual(['terms']);
	});

	it('skips notifications on an iPhone that has not installed the app', () => {
		expect(
			computeFirstRunSteps({
				notificationSupported: true,
				permission: 'default',
				iosNotInstalled: true,
			}),
		).toEqual(['terms']);
	});
});
