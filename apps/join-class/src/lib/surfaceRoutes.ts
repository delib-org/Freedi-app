import m from 'mithril';
import { applySurface, surfaceOf } from './surface';
import type { SurfaceTarget } from './surface';

/**
 * Puts every route on its surface (lib/surface.ts). Each entry of the route
 * table becomes a RouteResolver whose `render` writes `data-surface` and then
 * draws what the entry drew before (a route without a `render` of its own is
 * drawn as `[vnode]`, the fragment Mithril itself wraps it in).
 *
 * `render`, not `onmatch`: Mithril calls it inside the redraw that swaps the
 * view, so the attribute and the DOM change in the same frame. `onmatch` runs
 * before a lazy route has loaded, which would repaint the screen being left in
 * the next screen's look. It also covers every way a route changes without a
 * hook of its own: links, redirects, the browser's back button, and the
 * projector's "show here" mode, which is the route `/t/:mid/screen` and leaves
 * through `history.back()` (button, Esc and full-screen exit alike).
 */

type RouteEntry = m.RouteDefs[string];
type RouteComponent = Exclude<RouteEntry, m.RouteResolver>;

/** Mithril's own test for "this entry is a component, not a resolver". */
function isComponent(entry: RouteEntry): entry is RouteComponent {
	return typeof entry === 'function' || 'view' in entry;
}

function onSurface(pattern: string, entry: RouteEntry, target: SurfaceTarget): m.RouteResolver {
	const surface = surfaceOf(pattern);
	if (isComponent(entry)) {
		return {
			render(vnode) {
				applySurface(target, surface);

				return [m(entry, vnode.attrs)];
			},
		};
	}

	const resolver: m.RouteResolver = {
		render(vnode) {
			applySurface(target, surface);

			return entry.render ? entry.render(vnode) : [vnode];
		},
	};
	if (entry.onmatch) resolver.onmatch = entry.onmatch.bind(entry);

	return resolver;
}

export function withSurface(routes: m.RouteDefs, target: SurfaceTarget): m.RouteDefs {
	const wrapped: m.RouteDefs = {};
	for (const [pattern, entry] of Object.entries(routes)) {
		wrapped[pattern] = onSurface(pattern, entry, target);
	}

	return wrapped;
}
