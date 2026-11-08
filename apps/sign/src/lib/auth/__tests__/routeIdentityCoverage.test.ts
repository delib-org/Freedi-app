/**
 * @jest-environment node
 *
 * Fails when a privileged route goes back to trusting an unsigned cookie. Two
 * routes were missed by hand once, so the rule is enforced over the file tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_ROOT = join(__dirname, '../../../../app/api');
const PRIVILEGED_DIRECTORIES = ['admin', 'import'];
const MINIMUM_EXPECTED_ROUTES = 30;

const FORBIDDEN_IDENTITY_SOURCES: Array<[string, RegExp]> = [
  ['cookies() from next/headers', /\bcookies\(\)/],
  ['request.cookies', /\brequest\.cookies\b/],
  ['the raw cookie header', /headers\.get\(\s*['"]cookie['"]\s*\)/i],
  ['the userId cookie', /\.get\(\s*['"]userId['"]\s*\)/],
  ['the _uid cookie', /\.get\(\s*['"]_uid['"]\s*\)/],
  ['getUserIdFromCookie', /\bgetUserIdFromCookies?\b/],
  ['getUserFromCookies', /\bgetUserFromCookies\b/],
  ['getUserDisplayNameFromCookie', /\bgetUserDisplayNameFromCookie\b/],
  ['participant identity', /\bgetParticipant(Id|Identity)\b/],
];

const VERIFIED_IDENTITY = /\bgetVerified(UserId|Identity)\(/;

function routeFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFilesIn(path);

    return entry.name === 'route.ts' ? [path] : [];
  });
}

function forbiddenSourcesIn(source: string): string[] {
  return FORBIDDEN_IDENTITY_SOURCES.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

const privilegedRoutes = PRIVILEGED_DIRECTORIES.flatMap((directory) =>
  routeFilesIn(join(API_ROOT, directory))
);
const nameOf = (path: string): string => relative(API_ROOT, path);

describe('identity on privileged Sign routes', () => {
  it('scans the real route tree', () => {
    expect(privilegedRoutes.length).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_ROUTES);
  });

  it('recognizes the forbidden patterns, so an empty result means something', () => {
    expect(forbiddenSourcesIn("const s = await cookies(); s.get('userId')?.value;")).toEqual([
      'cookies() from next/headers',
      'the userId cookie',
    ]);
    expect(forbiddenSourcesIn('getUserIdFromCookie(cookieHeader)')).toEqual(['getUserIdFromCookie']);
    expect(forbiddenSourcesIn("request.headers.get('cookie')")).toEqual(['the raw cookie header']);
    expect(forbiddenSourcesIn('await getVerifiedUserId(request)')).toEqual([]);
  });

  it.each(privilegedRoutes.map((path) => [nameOf(path), path]))(
    '%s takes identity only from a verified credential',
    (_name, path) => {
      const source = readFileSync(path, 'utf8');

      expect(forbiddenSourcesIn(source)).toEqual([]);
      expect(source).toMatch(VERIFIED_IDENTITY);
    }
  );
});
