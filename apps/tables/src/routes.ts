/**
 * Route table of the Tables app (IA section 7). One entry per screen; the
 * `titleKey` is the screen's translated name. Host routes live under `/host`,
 * participant routes under `/sessions`.
 */

export type RouteRole = 'host' | 'participant';

export interface RouteDef {
	path: string;
	titleKey: string;
	role: RouteRole;
}

export const ROUTES: readonly RouteDef[] = [
	{ path: '/host', titleKey: 'tableAssignment.screen.hostList', role: 'host' },
	{ path: '/host/new', titleKey: 'tableAssignment.setup.title', role: 'host' },
	{ path: '/host/sessions/:id', titleKey: 'tableAssignment.session', role: 'host' },
	{ path: '/host/sessions/:id/screen', titleKey: 'tableAssignment.roomScreen', role: 'host' },
	{
		path: '/host/sessions/:id/participants',
		titleKey: 'tableAssignment.screen.participants',
		role: 'host',
	},
	{
		path: '/host/sessions/:id/preview',
		titleKey: 'tableAssignment.screen.preview',
		role: 'host',
	},
	{
		path: '/host/sessions/:id/assignment',
		titleKey: 'tableAssignment.screen.assignment',
		role: 'host',
	},
	{ path: '/sessions/:id', titleKey: 'tableAssignment.session', role: 'participant' },
	{ path: '/sessions/:id/name', titleKey: 'tableAssignment.editDetails', role: 'participant' },
	{ path: '/sessions/:id/preferences', titleKey: 'tableAssignment.rank', role: 'participant' },
	{ path: '/sessions/:id/position', titleKey: 'tableAssignment.position', role: 'participant' },
	{
		path: '/sessions/:id/my-table',
		titleKey: 'tableAssignment.screen.myTable',
		role: 'participant',
	},
	// Old links keep working (IA section 5): the host's land on the stage screen, the rest on the link.
	{ path: '/host/sessions/:id/topics', titleKey: 'tableAssignment.session', role: 'host' },
	{ path: '/host/sessions/:id/settings', titleKey: 'tableAssignment.session', role: 'host' },
	{ path: '/sessions/:id/topics', titleKey: 'tableAssignment.session', role: 'participant' },
	{
		path: '/sessions/:id/topics/:topicId',
		titleKey: 'tableAssignment.session',
		role: 'participant',
	},
];

/** The route the bare domain opens: the participant has no home without a link, so the host list. */
export const DEFAULT_ROUTE = '/host';

export interface RouteMatch {
	route: RouteDef;
	params: Record<string, string>;
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
	const patternParts = pattern.split('/').filter(Boolean);
	const pathParts = pathname.split('/').filter(Boolean);

	if (patternParts.length !== pathParts.length) return null;

	const params: Record<string, string> = {};

	for (let i = 0; i < patternParts.length; i += 1) {
		const part = patternParts[i];

		if (part.startsWith(':')) {
			params[part.slice(1)] = decodeURIComponent(pathParts[i]);
		} else if (part !== pathParts[i]) {
			return null;
		}
	}

	return params;
}

/** Resolve a pathname to its route and parameters, or null when no screen owns it. */
export function matchRoute(pathname: string): RouteMatch | null {
	for (const route of ROUTES) {
		const params = matchPattern(route.path, pathname);

		if (params) return { route, params };
	}

	return null;
}
