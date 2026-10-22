// Signing a teacher in for the e2e scripts. Teachers sign in with Google only
// (IA 13.4), and the Google popup is a flaky thing to drive in every script, so
// the scripts mint a custom token with firebase-admin against the Auth emulator
// and hand it to the page's own Firebase auth instance. The result is a
// non-anonymous account, exactly what a Google sign-in gives the app.
// e2e-entry.mjs ALSO walks the real "Continue with Google" button through the
// emulator's popup, so that path is covered once, end to end.
import { PROJECT_ID } from './e2e-env.mjs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function adminAuth() {
	const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });

	return getAuth(app);
}

/** A custom token for `uid` (the account is created on first sign-in). */
export function teacherToken(uid) {
	return adminAuth().createCustomToken(uid, { email: `${uid}@example.test` });
}

/**
 * Sign the page in as teacher `uid`. The page must already have loaded the app
 * (any route), because the sign-in goes through the app's own auth instance.
 */
export async function signInTeacher(page, baseUrl, uid) {
	const token = await teacherToken(uid);
	await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelector('#app, body') !== null);
	await page.evaluate(async (customToken) => {
		const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
		const { auth } = await import('/src/lib/firebase.ts');
		await authMod.signInWithCustomToken(auth, customToken);
	}, token);
}

/**
 * Click the app's Google button and finish the Auth emulator's popup page:
 * add an auto-generated account and sign in with it.
 */
export async function signInWithGooglePopup(page, context, buttonSelector) {
	const popupPromise = context.waitForEvent('page');
	await page.click(buttonSelector);
	const popup = await popupPromise;
	await popup.waitForLoadState('domcontentloaded');
	await popup.click('#add-account-button');
	await popup.click('#autogen-button');
	await popup.click('#sign-in');
}
