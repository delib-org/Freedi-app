import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import { SURFACE_ATTRIBUTE } from '../surface';
import type { SurfaceTarget } from '../surface';
import { withSurface } from '../surfaceRoutes';

function fakeRoot(): SurfaceTarget & { attrs: Map<string, string> } {
	const attrs = new Map<string, string>();

	return {
		attrs,
		getAttribute: (name) => attrs.get(name) ?? null,
		setAttribute: (name, value) => void attrs.set(name, value),
		removeAttribute: (name) => void attrs.delete(name),
	};
}

const Screen: m.Component<{ mid?: string }> = { view: () => m('main') };

/** What Mithril's router hands a resolver's `render`: a vnode carrying the route's params. */
function routeVnode(params: Record<string, string> = {}): m.Vnode {
	return m('div', params);
}

function resolverOf(routes: m.RouteDefs, pattern: string): m.RouteResolver {
	return routes[pattern] as m.RouteResolver;
}

/** Draws a route the way the router does, and returns what it drew. */
function draw(
	routes: m.RouteDefs,
	pattern: string,
	params: Record<string, string> = {},
): m.Children {
	const resolver = resolverOf(routes, pattern);
	if (!resolver.render) throw new Error(`route ${pattern} has no render`);

	return resolver.render(routeVnode(params));
}

describe('withSurface', () => {
	it('turns a component route into a resolver that draws the component with the route params', () => {
		const root = fakeRoot();
		const routes = withSurface({ '/m/:mid': Screen }, root);

		const drawn = draw(routes, '/m/:mid', { mid: 'lesson1' }) as m.Vnode[];

		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('student');
		expect(drawn).toHaveLength(1);
		expect(drawn[0].tag).toBe(Screen);
		expect(drawn[0].attrs).toEqual({ mid: 'lesson1' });
		expect(resolverOf(routes, '/m/:mid').onmatch).toBeUndefined();
	});

	it('keeps a resolver’s onmatch and draws the component it resolved', () => {
		const root = fakeRoot();
		const onmatch = vi.fn(() => Screen);
		const routes = withSurface({ '/t/:mid': { onmatch } }, root);
		const resolver = resolverOf(routes, '/t/:mid');

		expect(resolver.onmatch?.({ mid: 'lesson1' }, '/t/lesson1', '/t/:mid')).toBe(Screen);
		expect(onmatch).toHaveBeenCalledWith({ mid: 'lesson1' }, '/t/lesson1', '/t/:mid');
		// matching alone does not move the surface: the screen being left is still drawn
		expect(root.attrs.has(SURFACE_ATTRIBUTE)).toBe(false);

		const resolved = m(Screen, { mid: 'lesson1' });
		expect(resolver.render?.(resolved)).toEqual([resolved]);
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('teacher');
	});

	it('keeps a resolver’s own render', () => {
		const root = fakeRoot();
		const own = m('section');
		const routes = withSurface({ '/login': { render: () => own } }, root);

		expect(draw(routes, '/login')).toBe(own);
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('teacher');
	});

	it('follows the projector’s "show here" mode in and back out', () => {
		const root = fakeRoot();
		const routes = withSurface(
			{
				'/t/:mid': { onmatch: () => Screen },
				'/t/:mid/screen': { onmatch: () => Screen },
				'/m/:mid': Screen,
			},
			root,
		);

		draw(routes, '/t/:mid');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('teacher');

		// "Show on this screen" sets the route to /t/:mid/screen
		draw(routes, '/t/:mid/screen');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('projector');

		// Esc, the back button and leaving full screen all go back to the console route
		draw(routes, '/t/:mid');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('teacher');
	});

	it('gives every route of the table a surface', () => {
		const root = fakeRoot();
		const routes = withSurface({ '/': Screen, '/c/:code': Screen, '/t/:mid/screen': Screen }, root);

		expect(Object.keys(routes)).toEqual(['/', '/c/:code', '/t/:mid/screen']);
		draw(routes, '/');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('teacher');
		draw(routes, '/c/:code');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('student');
		draw(routes, '/t/:mid/screen');
		expect(root.attrs.get(SURFACE_ATTRIBUTE)).toBe('projector');
	});
});
