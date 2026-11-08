/**
 * Fails when client code calls a token-gated participant route with bare
 * `fetch`: the request would carry no ID token and always get a 401.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_ROOT = join(__dirname, '../../../..');
const SEARCH_ROOTS = ['src', 'app'].map((directory) => join(APP_ROOT, directory));
const IGNORED_DIRECTORIES = new Set(['__tests__', 'api']);

const BARE_FETCH_TO_GATED_ROUTE =
  /(?<![\w.])fetch\(\s*[`'"]\/api\/(?:evaluations\/|user-evaluations\/|user-solutions\/|comments\/|ai\/(?:feedback|rewrite-comment)|statements\/\$\{[^}]+\}\/(?:submit|batch|view|merge|prepare|detect-multi|check-similar|subscribe)|surveys\/\$\{[^}]+\}\/(?:enter|progress|detailed-progress|opening-slide\/mark-viewed|demographics\/\$\{[^}]+\}\/answers))/;

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : sourceFilesIn(path);

    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('client calls to token-gated participant routes', () => {
  it('recognizes a bare fetch but not participantFetch', () => {
    expect(BARE_FETCH_TO_GATED_ROUTE.test('fetch(`/api/evaluations/${id}`, {')).toBe(true);
    expect(BARE_FETCH_TO_GATED_ROUTE.test('fetch(`/api/surveys/${s}/progress`)')).toBe(true);
    expect(BARE_FETCH_TO_GATED_ROUTE.test('participantFetch(`/api/evaluations/${id}`)')).toBe(false);
    expect(BARE_FETCH_TO_GATED_ROUTE.test('fetch(`/api/statements/${id}/stats`)')).toBe(false);
  });

  it('finds none in the app', () => {
    const offenders = SEARCH_ROOTS.flatMap(sourceFilesIn)
      .filter((path) => BARE_FETCH_TO_GATED_ROUTE.test(readFileSync(path, 'utf8')))
      .map((path) => relative(APP_ROOT, path));

    expect(offenders).toEqual([]);
  });
});
