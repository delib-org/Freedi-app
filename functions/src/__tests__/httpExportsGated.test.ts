import { describe, it, expect, jest } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

jest.mock('../index', () => ({ db: {} }));

import { resolveAnalysisHours } from '../fn_metrics';

/**
 * A static census of every HTTP function. A new endpoint fails this test until
 * someone decides whether it is gated or deliberately public, which is how
 * analyzeSubscriptionPatterns stayed open after the first pass over index.ts.
 */

const SRC = join(__dirname, '..');

const GATED_WRAPPERS = new Set([
	'wrapAuthedHttpFunction',
	'wrapAuthedMemoryIntensiveHttpFunction',
	'wrapAdminHttpFunction',
]);

/** Exported through a plain wrapper. Each one has a reason to be there. */
const PLAIN_WRAPPER_ALLOW_LIST = new Set([
	'unsubscribeEmail', // Opt-out reachable with no account
	'getBulkStatements', // Verifies the ID token inside the handler
	'trackDailyLogin', // Verifies the ID token inside the handler
]);

/** Written as a bare onRequest. These serve public pages and emailed links. */
const BARE_ON_REQUEST_ALLOW_LIST = new Set([
	'serveOgTags', // Link previews for crawlers
	'serveJoinShareRoutes', // Link previews for crawlers
	'ssrChat', // Server-rendered Chat pages
	'odysseyDigestUnsubscribe', // Emailed opt-out link, signed
]);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);

		return entry.name.endsWith('.ts') ? [path] : [];
	});
}

function wrappedExports(): Array<{ name: string; wrapper: string }> {
	const source = readFileSync(join(SRC, 'index.ts'), 'utf8');

	return [...source.matchAll(/^exports\.(\w+)\s*=\s*(wrap\w*Http\w*)\(/gm)].map(
		([, name, wrapper]) => ({
			name,
			wrapper,
		}),
	);
}

function bareOnRequestExports(): string[] {
	return sourceFiles(SRC).flatMap((file) =>
		[
			...readFileSync(file, 'utf8').matchAll(
				/(?:export\s+const\s+|exports\.)(\w+)\s*=\s*(?:[\w.]+\.)?onRequest\b/g,
			),
		].map(([, name]) => `${name}`),
	);
}

describe('HTTP function census', () => {
	it('finds the wrapped exports, so a broken pattern cannot pass silently', () => {
		expect(wrappedExports().length).toBeGreaterThan(40);
	});

	it('gates every wrapped export or lists it as deliberately plain', () => {
		const ungated = wrappedExports()
			.filter(({ wrapper }) => !GATED_WRAPPERS.has(wrapper))
			.map(({ name }) => name);

		expect(ungated.sort()).toEqual([...PLAIN_WRAPPER_ALLOW_LIST].sort());
	});

	it('has no bare onRequest outside the public allow-list', () => {
		expect(bareOnRequestExports().sort()).toEqual([...BARE_ON_REQUEST_ALLOW_LIST].sort());
	});

	it('uses only wrappers this test knows how to classify', () => {
		const known = new Set([...GATED_WRAPPERS, 'wrapHttpFunction']);
		const unknown = wrappedExports().filter(({ wrapper }) => !known.has(wrapper));

		expect(unknown.map(({ wrapper }) => wrapper)).toEqual([]);
	});

	it('keeps the source walk inside functions/src', () => {
		expect(sourceFiles(SRC).some((file) => relative(SRC, file) === 'index.ts')).toBe(true);
	});
});

describe('resolveAnalysisHours', () => {
	it.each([
		[undefined, 24],
		['abc', 24],
		['0', 24],
		['48', 48],
		['-5', 1],
		['999999', 168],
	])('turns %s into %s', (raw, expected) => {
		expect(resolveAnalysisHours(raw)).toBe(expected);
	});
});
