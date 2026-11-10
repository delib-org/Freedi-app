import { readInitialRoute, saveInitialRoute, toSafeRedirectPath } from '../initialRoute';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

describe('initialRoute', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	describe('toSafeRedirectPath', () => {
		it('keeps a relative path with its query', () => {
			expect(toSafeRedirectPath('/statement/s1?tab=options')).toBe('/statement/s1?tab=options');
		});

		it.each([
			['absolute URL', 'https://evil.com/x'],
			['protocol-relative', '//evil.com'],
			['backslash host', '/\\evil.com'],
			['tab hidden slash', '/\t/evil.com'],
			['newline hidden slash', '/\n/evil.com'],
			['dot segments collapsing to a host', '/a/..//evil.com'],
			['javascript scheme', 'javascript:alert(1)'],
			['no leading slash', 'statement/s1'],
			['empty', ''],
			['not a string', 42],
			['undefined', undefined],
		])('rejects %s', (_name, target) => {
			expect(toSafeRedirectPath(target)).toBeUndefined();
		});

		it.each(['/start', '/start/', '/401', '/401/', '/401//', '/401?x=1'])(
			'does not return to %s',
			(target) => {
				expect(toSafeRedirectPath(target)).toBeUndefined();
			},
		);
	});

	describe('saveInitialRoute and readInitialRoute', () => {
		it('round-trips the query string', () => {
			saveInitialRoute('/statement/s1?tab=results');

			expect(readInitialRoute()).toBe('/statement/s1?tab=results');
		});

		it('does not store an unsafe target', () => {
			saveInitialRoute('//evil.com');

			expect(localStorage.getItem(LocalStorageObjects.InitialRoute)).toBeNull();
		});

		it('rejects an unsafe value already in storage', () => {
			localStorage.setItem(
				LocalStorageObjects.InitialRoute,
				JSON.stringify({ pathname: '//evil.com' }),
			);

			expect(readInitialRoute()).toBeUndefined();
		});

		it('reads the shape older builds saved', () => {
			localStorage.setItem(
				LocalStorageObjects.InitialRoute,
				JSON.stringify({ pathname: '/statement/old' }),
			);

			expect(readInitialRoute()).toBe('/statement/old');
		});

		it('survives corrupt storage and an empty slot', () => {
			expect(readInitialRoute()).toBeUndefined();

			localStorage.setItem(LocalStorageObjects.InitialRoute, '{not json');

			expect(readInitialRoute()).toBeUndefined();
		});
	});
});
