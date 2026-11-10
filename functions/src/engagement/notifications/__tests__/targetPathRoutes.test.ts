/**
 * Every notification link must open a screen that exists. These sources build
 * their links as literals, so the test reads them as text and matches each
 * link against the `path:` values in the main app's route tables: a link or a
 * route renamed without the other fails here instead of landing on a 404.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const ENGAGEMENT = join(REPO_ROOT, 'functions', 'src', 'engagement');

const NOTIFICATION_SOURCES = [
	join(ENGAGEMENT, 'credits', 'levelProgression.ts'),
	join(ENGAGEMENT, 'credits', 'badgeEngine.ts'),
	join(ENGAGEMENT, 'scheduled', 'dailyDigest.ts'),
	join(ENGAGEMENT, 'scheduled', 'weeklyDigest.ts'),
	join(ENGAGEMENT, 'notifications', 'socialProofTrigger.ts'),
];

const ROUTE_TABLES = [
	join(REPO_ROOT, 'src', 'routes', 'protectedRoutes.tsx'),
	join(REPO_ROOT, 'src', 'routes', 'publicRoutes.ts'),
];

/** A `${...}` in a template link stands for one id in the path. */
const PLACEHOLDER = ':param';

function literalTargetPaths(source: string): string[] {
	const links = source.matchAll(/targetPath:\s*(?:'([^']*)'|`([^`]*)`)/g);

	return [...links].map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, PLACEHOLDER));
}

function knownRoutes(): string[] {
	return ROUTE_TABLES.flatMap((file) => {
		const paths = readFileSync(file, 'utf8').matchAll(/path:\s*'([^']+)'/g);

		// A path that starts with a parameter (`:sort`) is a nested child route,
		// relative to its parent, and would otherwise match any one-segment link.
		return [...paths].map((m) => m[1]).filter((path) => !path.startsWith(':'));
	});
}

function pathMatchesRoute(link: string, route: string): boolean {
	const linkSegments = link.split('?')[0].replace(/^\//, '').split('/');
	const routeSegments = route.replace(/^\//, '').split('/');
	if (linkSegments.length !== routeSegments.length) return false;

	return routeSegments.every(
		(segment, i) => segment.startsWith(':') || segment === linkSegments[i],
	);
}

describe('notification targetPath links', () => {
	const routes = knownRoutes();

	it('reads the route tables', () => {
		expect(routes).toEqual(
			expect.arrayContaining(['home', 'my/engagement', 'statement/:statementId']),
		);
	});

	it.each(NOTIFICATION_SOURCES)('%s links only to real routes', (file) => {
		const links = literalTargetPaths(readFileSync(file, 'utf8'));

		expect(links.length).toBeGreaterThan(0);
		links.forEach((link) => {
			expect({ link, known: routes.some((route) => pathMatchesRoute(link, route)) }).toEqual({
				link,
				known: true,
			});
		});
	});

	it('rejects a link with no route', () => {
		expect(routes.some((route) => pathMatchesRoute('/profile', route))).toBe(false);
		expect(routes.some((route) => pathMatchesRoute('/notifications', route))).toBe(false);
	});

	it('sends digests to the inbox view of the home screen', () => {
		['dailyDigest.ts', 'weeklyDigest.ts'].forEach((file) => {
			const links = literalTargetPaths(readFileSync(join(ENGAGEMENT, 'scheduled', file), 'utf8'));

			expect(links).toEqual(['/home?view=inbox']);
		});
	});
});
