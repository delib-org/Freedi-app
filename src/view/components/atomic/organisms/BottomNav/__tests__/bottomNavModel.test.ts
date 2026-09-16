import { isMapPath, resolveBottomNavItem, shouldShowBottomNav } from '../bottomNavModel';

describe('resolveBottomNavItem', () => {
	it('marks home on /home and the root', () => {
		expect(resolveBottomNavItem('/home')).toBe('home');
		expect(resolveBottomNavItem('/')).toBe('home');
		expect(resolveBottomNavItem('/home', '?other=1')).toBe('home');
	});

	it('marks the inbox view of home', () => {
		expect(resolveBottomNavItem('/home', '?view=inbox')).toBe('inbox');
	});

	it('marks me on the profile and its sub-pages, not on my-suggestions', () => {
		expect(resolveBottomNavItem('/my')).toBe('me');
		expect(resolveBottomNavItem('/my/check-notifications')).toBe('me');
		expect(resolveBottomNavItem('/my-suggestions/statement/x')).toBeNull();
	});

	it('keeps home active on question screens', () => {
		expect(resolveBottomNavItem('/statement/q1')).toBe('home');
		expect(resolveBottomNavItem('/stage/q1')).toBe('home');
	});

	it('marks nothing elsewhere', () => {
		expect(resolveBottomNavItem('/events/x')).toBeNull();
	});
});

describe('map screens', () => {
	it('detects full-screen maps', () => {
		expect(isMapPath('/map/q1')).toBe(true);
		expect(isMapPath('/map/q1/embed')).toBe(true);
		expect(isMapPath('/statement-screen/q1/mind-map')).toBe(true);
		expect(isMapPath('/statement-screen/q1/settings')).toBe(false);
		expect(isMapPath('/statement/q1')).toBe(false);
	});

	it('hides the nav on maps only', () => {
		expect(shouldShowBottomNav('/map/q1')).toBe(false);
		expect(shouldShowBottomNav('/statement/q1')).toBe(true);
		expect(shouldShowBottomNav('/home')).toBe(true);
	});
});
