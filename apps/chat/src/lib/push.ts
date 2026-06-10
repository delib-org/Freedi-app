/**
 * WizCol-Chat web push (FCM) client.
 *
 * Client responsibilities only: detect support, register the FCM service
 * worker, request permission, and mint the FCM token. Persistence (storing the
 * token, fanning it out to subscriptions, per-question follows) is done
 * server-side via `/api/push` with the admin SDK — the browser just posts the
 * token it minted. Everything here dynamically imports the Firebase SDK so
 * nothing lands in the SSR/first-paint bundle.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Messaging, MessagePayload } from 'firebase/messaging';

/** Public Firebase config (same values as firebaseClient, mirrored for the SW query string). */
const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey: string | undefined = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const INVALID_VAPID_KEYS = new Set(['', 'undefined', 'null', 'your-vapid-key']);

const SW_URL = '/firebase-messaging-sw.js';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export type PushSupport = { supported: true } | { supported: false; reason: string };

/** iOS only allows web push from an installed (home-screen) PWA on 16.4+. */
export function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false;

	return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const displayMode = window.matchMedia('(display-mode: standalone)').matches;
	const iosStandalone =
		'standalone' in window.navigator &&
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true;

	return displayMode || iosStandalone;
}

/** Whether this browser/context can receive web push at all. */
export function getPushSupport(): PushSupport {
	if (typeof window === 'undefined') return { supported: false, reason: 'ssr' };
	if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-service-worker' };
	if (!('Notification' in window)) return { supported: false, reason: 'no-notification-api' };
	if (!('PushManager' in window)) return { supported: false, reason: 'no-push-manager' };
	if (isIOS() && !isStandalone()) {
		return { supported: false, reason: 'ios-needs-install' };
	}

	return { supported: true };
}

/** Current notification permission, or 'unsupported'. */
export function getPermission(): NotificationPermission | 'unsupported' {
	if (!('Notification' in window)) return 'unsupported';

	return Notification.permission;
}

/**
 * Register the FCM service worker, passing the Firebase config in the query
 * string (the SW can't read `import.meta.env`).
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
	const query = new URLSearchParams({
		apiKey: firebaseConfig.apiKey,
		authDomain: firebaseConfig.authDomain,
		projectId: firebaseConfig.projectId,
		storageBucket: firebaseConfig.storageBucket,
		messagingSenderId: firebaseConfig.messagingSenderId,
		appId: firebaseConfig.appId,
	}).toString();

	const registration = await navigator.serviceWorker.register(`${SW_URL}?${query}`, {
		scope: FCM_SW_SCOPE,
	});
	await navigator.serviceWorker.ready;

	return registration;
}

let messagingPromise: Promise<Messaging> | null = null;

async function getMessagingClient(): Promise<Messaging> {
	if (!messagingPromise) {
		messagingPromise = (async () => {
			const { getApps, getApp, initializeApp } = await import('firebase/app');
			// Reuse the shared FirebaseApp if firebaseClient already created it;
			// otherwise create it here so the foreground handler can run standalone.
			const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
			const { getMessaging } = await import('firebase/messaging');

			return getMessaging(app);
		})();
	}

	return messagingPromise;
}

export type TokenResult = { ok: true; token: string } | { ok: false; reason: string };

/**
 * Acquire an FCM token for this device: support + VAPID check, permission
 * prompt, SW registration, token mint. MUST be called from a user gesture so
 * the permission prompt isn't blocked. Does NOT persist anything — pass the
 * token to the server (`/api/push`).
 */
export async function ensurePushToken(): Promise<TokenResult> {
	const support = getPushSupport();
	if (!support.supported) return { ok: false, reason: support.reason };

	if (!vapidKey || INVALID_VAPID_KEYS.has(vapidKey)) {
		return { ok: false, reason: 'missing-vapid-key' };
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };

	try {
		const registration = await registerServiceWorker();
		const messaging = await getMessagingClient();
		const { getToken } = await import('firebase/messaging');
		const token = await getToken(messaging, {
			vapidKey,
			serviceWorkerRegistration: registration,
		});

		if (!token) return { ok: false, reason: 'no-token' };

		return { ok: true, token };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' };
	}
}

type ApiResult = { ok: true; data: Record<string, unknown> } | { ok: false; reason: string };

async function postPush(body: Record<string, unknown>): Promise<ApiResult> {
	try {
		const res = await fetch('/api/push', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			return { ok: false, reason: (data as { error?: string }).error ?? `http-${res.status}` };
		}

		return { ok: true, data };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : 'network-error' };
	}
}

export type EnablePushResult =
	| { ok: true; subscriptionsSynced: number }
	| { ok: false; reason: string };

/**
 * Global opt-in (the header bell): mint a token and register it server-side,
 * fanning it out to the user's existing push-enabled subscriptions.
 */
export async function enablePush(): Promise<EnablePushResult> {
	const tokenResult = await ensurePushToken();
	if (!tokenResult.ok) return { ok: false, reason: tokenResult.reason };

	const result = await postPush({ action: 'register', token: tokenResult.token });
	if (!result.ok) return { ok: false, reason: result.reason };

	return { ok: true, subscriptionsSynced: Number(result.data.subscriptionsSynced ?? 0) };
}

export type FollowResult = { ok: true; following: boolean } | { ok: false; reason: string };

/** Follow a specific question for push (per-question opt-in). */
export async function followQuestion(statementId: string): Promise<FollowResult> {
	const tokenResult = await ensurePushToken();
	if (!tokenResult.ok) return { ok: false, reason: tokenResult.reason };

	const result = await postPush({
		action: 'follow',
		statementId,
		token: tokenResult.token,
	});
	if (!result.ok) return { ok: false, reason: result.reason };

	return { ok: true, following: true };
}

/** Stop push for a specific question. */
export async function unfollowQuestion(statementId: string): Promise<FollowResult> {
	// Best-effort: include the token so the server can drop it from `tokens[]`.
	const tokenResult = await ensurePushToken();
	const token = tokenResult.ok ? tokenResult.token : undefined;

	const result = await postPush({ action: 'unfollow', statementId, token });
	if (!result.ok) return { ok: false, reason: result.reason };

	return { ok: true, following: false };
}

export type SubscriptionState = 'unsubscribed' | 'instant' | 'daily' | 'weekly' | 'muted';

/**
 * Set the notification frequency for a question (per-discussion override). Used
 * by the BranchBell. `instant` also opts the device into push if a token can be
 * minted; `unsubscribed`/`muted` stop delivery without deleting the follow.
 */
export async function setQuestionFrequency(
	statementId: string,
	state: SubscriptionState,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; reason: string }> {
	// For instant we want push too; mint a token (best-effort, user gesture).
	let token: string | undefined;
	if (state === 'instant') {
		const tokenResult = await ensurePushToken();
		if (tokenResult.ok) token = tokenResult.token;
	}

	const result = await postPush({ action: 'setFrequency', statementId, state, token });
	if (!result.ok) return { ok: false, reason: result.reason };

	return { ok: true, state };
}

/** Read the current per-question subscription state (server-side truth). */
export async function getSubscriptionState(statementId: string): Promise<SubscriptionState> {
	try {
		const res = await fetch(
			`/api/push?statementId=${encodeURIComponent(statementId)}&detail=state`,
		);
		if (!res.ok) return 'unsubscribed';
		const data = (await res.json()) as { state?: SubscriptionState };

		return data.state ?? 'unsubscribed';
	} catch {
		return 'unsubscribed';
	}
}

/** Read whether the user currently follows a question (server-side truth). */
export async function getFollowStatus(statementId: string): Promise<boolean> {
	try {
		const res = await fetch(`/api/push?statementId=${encodeURIComponent(statementId)}`);
		if (!res.ok) return false;
		const data = (await res.json()) as { following?: boolean };

		return Boolean(data.following);
	} catch {
		return false;
	}
}

/**
 * Foreground message handler — FCM does NOT auto-display notifications while the
 * tab is focused, so we surface them ourselves. Returns an unsubscribe fn.
 */
export async function onForegroundMessage(
	handler: (payload: MessagePayload) => void,
): Promise<() => void> {
	if (getPermission() !== 'granted') return () => {};

	try {
		const messaging = await getMessagingClient();
		const { onMessage } = await import('firebase/messaging');

		return onMessage(messaging, handler);
	} catch {
		return () => {};
	}
}
