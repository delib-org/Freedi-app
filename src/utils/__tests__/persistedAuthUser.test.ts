import { hasPersistedFirebaseUser } from '../persistedAuthUser';

const AUTH_KEY = 'firebase:authUser:test-api-key:[DEFAULT]';

/** The jsdom localStorage mock does not enumerate its keys; stub what a browser returns. */
function storeKeys(entries: Record<string, string>): void {
	Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
	jest.spyOn(Object, 'keys').mockReturnValueOnce(Object.keys(entries));
}

describe('hasPersistedFirebaseUser', () => {
	beforeEach(() => {
		localStorage.clear();
		jest.restoreAllMocks();
	});

	it('returns false when nothing is stored', () => {
		storeKeys({});

		expect(hasPersistedFirebaseUser()).toBe(false);
	});

	it('returns true when a Firebase auth user is stored', () => {
		storeKeys({ [AUTH_KEY]: JSON.stringify({ uid: 'user-1' }) });

		expect(hasPersistedFirebaseUser()).toBe(true);
	});

	it('ignores an auth key whose value is the string "null"', () => {
		storeKeys({ [AUTH_KEY]: 'null' });

		expect(hasPersistedFirebaseUser()).toBe(false);
	});

	it('ignores unrelated keys', () => {
		storeKeys({ displayName: 'Dana', 'firebase:host:example': 'x' });

		expect(hasPersistedFirebaseUser()).toBe(false);
	});

	it('returns false when localStorage is unavailable', () => {
		jest.spyOn(Object, 'keys').mockImplementationOnce(() => {
			throw new Error('SecurityError');
		});

		expect(hasPersistedFirebaseUser()).toBe(false);
	});
});
