/**
 * Whether Firebase Auth has a signed-in user saved in localStorage.
 *
 * The app keeps its auth session in `browserLocalPersistence`, which writes
 * `firebase:authUser:<apiKey>:<appName>` keys. Reading them synchronously lets
 * startup code decide things before the Firebase SDK has even downloaded.
 * Firebase still verifies the session; this is only a hint.
 *
 * Dependency-free on purpose: the entry chunk (main.tsx) imports it.
 */
export function hasPersistedFirebaseUser(): boolean {
	try {
		return Object.keys(localStorage).some((key) => {
			if (!key.startsWith('firebase:authUser:')) return false;
			const value = localStorage.getItem(key);

			return !!value && value !== 'null';
		});
	} catch {
		return false;
	}
}
