import { describe, expect, it } from 'vitest';
import { ODYSSEY_HOSTS, resolveAuthDomain } from '../authDomain';

const FALLBACK = 'wizcol-app.firebaseapp.com';

describe('resolveAuthDomain', () => {
	it.each(ODYSSEY_HOSTS)('uses %s as its own auth domain', (host) => {
		expect(resolveAuthDomain(host, FALLBACK)).toBe(host);
	});

	it('is case-insensitive', () => {
		expect(resolveAuthDomain('Wizcol-OD.web.app', FALLBACK)).toBe('wizcol-od.web.app');
	});

	it.each(['localhost', 'freedi-test.web.app', 'evil.example.com', 'wizcol-od.web.app.evil.com'])(
		'keeps the configured domain on %s',
		(host) => {
			expect(resolveAuthDomain(host, FALLBACK)).toBe(FALLBACK);
		},
	);

	it('passes an undefined fallback through', () => {
		expect(resolveAuthDomain('localhost', undefined)).toBeUndefined();
	});
});
