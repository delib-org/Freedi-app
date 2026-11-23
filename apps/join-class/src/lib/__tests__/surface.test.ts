import { describe, expect, it } from 'vitest';
import { SURFACE_ATTRIBUTE, applySurface, applySurfaceOf, surfaceOf } from '../surface';
import type { Surface, SurfaceTarget } from '../surface';

function fakeRoot(): SurfaceTarget & { attrs: Map<string, string>; writes: number } {
	const attrs = new Map<string, string>();
	const root = {
		attrs,
		writes: 0,
		getAttribute: (name: string) => attrs.get(name) ?? null,
		setAttribute: (name: string, value: string) => {
			root.writes += 1;
			attrs.set(name, value);
		},
		removeAttribute: (name: string) => void attrs.delete(name),
	};

	return root;
}

describe('surfaceOf', () => {
	// The table of the redesign port spec, section 1.
	const cases: Array<[string, Surface]> = [
		['/c/482913', 'student'],
		['/seat/abc123', 'student'],
		['/m/lesson1', 'student'],
		['/', 'teacher'],
		['/login', 'teacher'],
		['/t', 'teacher'],
		['/t/plans/plan1', 'teacher'],
		['/t/plans/plan1/games/game1', 'teacher'],
		['/t/lesson1', 'teacher'],
		['/t/lesson1/plan', 'teacher'],
		['/t/lesson1/registration', 'teacher'],
		['/t/lesson1/table/3', 'teacher'],
		['/t/lesson1/screen', 'projector'],
	];

	it.each(cases)('%s is the %s surface', (path, surface) => {
		expect(surfaceOf(path)).toBe(surface);
	});

	it('reads a route pattern the same way as a path', () => {
		expect(surfaceOf('/c/:code')).toBe('student');
		expect(surfaceOf('/seat/:seatCode')).toBe('student');
		expect(surfaceOf('/m/:mid')).toBe('student');
		expect(surfaceOf('/t/:mid')).toBe('teacher');
		expect(surfaceOf('/t/plans/:planId')).toBe('teacher');
		expect(surfaceOf('/t/:mid/screen')).toBe('projector');
	});

	it('ignores the query string, the hash and a trailing slash', () => {
		expect(surfaceOf('/t/lesson1/screen?mode=window')).toBe('projector');
		expect(surfaceOf('/t/lesson1/screen/')).toBe('projector');
		expect(surfaceOf('/m/lesson1?lang=ar#top')).toBe('student');
		expect(surfaceOf('/login?next=%2Ft%2Flesson1%2Fscreen')).toBe('teacher');
	});

	it('keeps the plan screens on the teacher surface, whatever the plan is called', () => {
		expect(surfaceOf('/t/plans/screen')).toBe('teacher');
	});

	it('does not take a deeper path for the projector', () => {
		expect(surfaceOf('/t/lesson1/screen/extra')).toBe('teacher');
	});

	it('puts unknown paths on the teacher surface: they fall to the front door', () => {
		expect(surfaceOf('/q/old-link')).toBe('teacher');
		expect(surfaceOf('/invite')).toBe('teacher');
		expect(surfaceOf('')).toBe('teacher');
	});
});

describe('applySurface', () => {
	it('writes data-surface', () => {
		const root = fakeRoot();
		applySurface(root, 'student');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('student');
	});

	it('does not write again when the surface is already there', () => {
		const root = fakeRoot();
		applySurface(root, 'teacher');
		applySurface(root, 'teacher');
		applySurface(root, 'teacher');
		expect(root.writes).toBe(1);
	});

	it('replaces the surface when the route changes', () => {
		const root = fakeRoot();
		applySurface(root, 'teacher');
		applySurface(root, 'projector');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('projector');
		expect(root.writes).toBe(2);
	});

	it('removes the attribute for null', () => {
		const root = fakeRoot();
		applySurface(root, 'student');
		applySurface(root, null);
		expect(root.attrs.has(SURFACE_ATTRIBUTE)).toBe(false);
	});
});

describe('applySurfaceOf', () => {
	it('applies the surface of the path', () => {
		const root = fakeRoot();
		applySurfaceOf(root, '/c/482913');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('student');
		applySurfaceOf(root, '/t/lesson1/screen');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('projector');
	});
});
