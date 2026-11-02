import { describe, expect, it } from 'vitest';
import { showsBackLink } from '../TeacherBackBar';

describe('showsBackLink (the home-only rule)', () => {
	it('shows back when there is a parent that is not the home', () => {
		expect(showsBackLink({ href: '/t/plans/p1', label: 'Plan' })).toBe(true);
		expect(showsBackLink({ href: '/t/abc', label: 'Lesson' })).toBe(true);
	});

	it('is home only with no back target', () => {
		expect(showsBackLink({})).toBe(false);
		expect(showsBackLink({ href: '' })).toBe(false);
	});

	it('is home only when the back target is the home', () => {
		expect(showsBackLink({ href: '/t', label: 'My lesson plans' })).toBe(false);
	});

	it('does not mistake a path that merely starts with /t for the home', () => {
		expect(showsBackLink({ href: '/t/plans/p1' })).toBe(true);
	});
});
