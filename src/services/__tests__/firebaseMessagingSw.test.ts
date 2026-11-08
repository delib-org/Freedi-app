/**
 * The messaging service worker loads Firebase from gstatic, so npm cannot keep
 * it in step with the page. When the two drift, the page's SDK upgrades
 * `firebase-messaging-database` past the schema version the worker's SDK
 * opens, and push breaks with "The requested version (1) is less than the
 * existing version (2)" — which is how 9.22.0 in the worker next to 12.x in
 * the page reached Sentry. Pin them together.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..');

describe('public/firebase-messaging-sw.js', () => {
	it('loads the same Firebase version the app bundles', () => {
		const worker = readFileSync(join(repoRoot, 'public', 'firebase-messaging-sw.js'), 'utf8');
		const { version } = JSON.parse(
			readFileSync(join(repoRoot, 'node_modules', 'firebase', 'package.json'), 'utf8'),
		) as { version: string };

		const loaded = [...worker.matchAll(/gstatic\.com\/firebasejs\/([^/]+)\//g)].map(
			(match) => match[1],
		);

		expect(loaded.length).toBeGreaterThan(0);
		expect([...new Set(loaded)]).toEqual([version]);
	});
});
