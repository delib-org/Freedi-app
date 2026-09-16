export type BottomNavItem = 'home' | 'inbox' | 'me';

/** The inbox is a view of Home, so back from a question returns to it. */
export const HOME_VIEW_PARAM = 'view';
export const INBOX_VIEW = 'inbox';
export const HOME_PATH = '/home';
export const INBOX_PATH = `${HOME_PATH}?${HOME_VIEW_PARAM}=${INBOX_VIEW}`;
export const ME_PATH = '/my';

export const BOTTOM_NAV_PATHS: Record<BottomNavItem, string> = {
	home: HOME_PATH,
	inbox: INBOX_PATH,
	me: ME_PATH,
};

/** Statement screens that are full-screen maps (level 3). */
export const MAP_SCREENS: readonly string[] = [
	'mind-map',
	'agreement-map',
	'polarization-index',
	'sub-questions-map',
	'cluster-board',
];

const STATEMENT_PREFIX = /^\/(statement|stage|statement-screen)\//;

export function isMapPath(pathname: string): boolean {
	if (/^\/map(\/|$)/.test(pathname)) return true;
	const match = pathname.match(/^\/(?:statement-screen|statement)\/[^/]+\/([^/?#]+)/);

	return !!match && MAP_SCREENS.includes(match[1]);
}

/** Which nav item is active; question screens sit under Home, as in the prototype. */
export function resolveBottomNavItem(pathname: string, search = ''): BottomNavItem | null {
	if (pathname === HOME_PATH || pathname === `${HOME_PATH}/` || pathname === '/') {
		return new URLSearchParams(search).get(HOME_VIEW_PARAM) === INBOX_VIEW ? 'inbox' : 'home';
	}
	if (pathname === ME_PATH || pathname.startsWith(`${ME_PATH}/`)) return 'me';
	if (STATEMENT_PREFIX.test(pathname)) return 'home';

	return null;
}

/** The floating nav stays out of full-screen map screens. */
export function shouldShowBottomNav(pathname: string): boolean {
	return !isMapPath(pathname);
}
