import { describe, expect, it } from 'vitest';
import { backTarget, routeFromHash } from '../routeTrail';

describe('routeFromHash', () => {
	it('reads the route out of the Mithril hash', () => {
		expect(routeFromHash('#!/teach/scenarios?x=1')).toBe('/teach/scenarios?x=1');
		expect(routeFromHash('')).toBe('/');
	});
});

describe('backTarget', () => {
	it('returns to the teacher screen the teacher came from', () => {
		expect(backTarget('/teach/scenarios', [], '/teach', '/teach/scenarios/abc')).toBe('/teach');
		expect(
			backTarget('/teach/scenarios', [], '/teach/class/c1?tab=students', '/teach/scenarios/abc'),
		).toBe('/teach/class/c1?tab=students');
	});

	it('falls back when there is no earlier screen (a bookmark)', () => {
		expect(backTarget('/teach/scenarios', [], '', '/teach/scenarios/abc')).toBe('/teach/scenarios');
	});

	it('falls back when the earlier screen is not a teacher screen', () => {
		expect(backTarget('/teach/scenarios', [], '/join/12345', '/teach/scenarios/abc')).toBe(
			'/teach/scenarios',
		);
	});

	it('does not return to the form that made what is on screen', () => {
		expect(
			backTarget(
				'/teach/scenarios',
				['/teach/scenarios/new'],
				'/teach/scenarios/new',
				'/teach/scenarios/abc',
			),
		).toBe('/teach/scenarios');
	});

	it('does not return to the screen it is already on', () => {
		expect(
			backTarget('/teach/scenarios', [], '/teach/scenarios/abc?a=1', '/teach/scenarios/abc'),
		).toBe('/teach/scenarios');
	});
});
