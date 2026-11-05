import m from 'mithril';
import { DEFAULT_ROUTE, ROUTES } from '@/routes';
import { placeholderView } from '@/views/Placeholder';

/** Mithril route table: every route in ROUTES resolves to its view. */
export function buildRouteTable(): Record<string, m.Component> {
	const table: Record<string, m.Component> = {};

	for (const route of ROUTES) {
		table[route.path] = placeholderView(route);
	}

	return table;
}

/** Mount the router on `root`; a path no screen owns falls back to the host list. */
export function mountRouter(root: HTMLElement): void {
	m.route.prefix = '';
	m.route(root, DEFAULT_ROUTE, buildRouteTable());
}
