/**
 * Keep this entry dependency-free. Signed-out visitors should not download the
 * application, Firestore, Redux, monitoring or PWA code to see the landing page.
 */
function hasPersistedFirebaseUser(): boolean {
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

const isLandingPath = location.pathname === '/' || location.pathname === '/start';

if (isLandingPath && !hasPersistedFirebaseUser()) {
	void import('./landing-main');
} else {
	// A known signed-in visitor at the marketing URL can skip its component and
	// dictionary entirely. Firebase still verifies the session in the full app.
	if (isLandingPath) history.replaceState(null, '', '/home');
	void import('./app-main');
}
