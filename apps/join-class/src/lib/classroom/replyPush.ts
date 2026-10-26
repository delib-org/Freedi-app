import { Collections } from '@freedi/shared-types';
import { app, db, doc, setDoc } from '../firebase';
import { getLang } from '../i18n';
import { getUserState } from '../user';
import {
	pushSupportOf,
	type PushAnswer,
	type PushEnvironment,
	type PushSupport,
} from './replyPushLogic';

export type { PushAnswer, PushSupport } from './replyPushLogic';
export { shouldAskPush } from './replyPushLogic';

/**
 * "Tell me when someone replies to my proposal" (IA 22.7) on this device.
 *
 * Asked once per lesson, inline, after the student's first proposal is sent,
 * and only where web push works: Notification + PushManager + service workers,
 * and on iOS only from the home-screen app (Safari in a tab cannot push). A
 * "yes" registers the join-class push worker (its own scope, beside the PWA
 * worker), takes an FCM token and stores it as `pushNotifications/{token}`
 * with `app: 'join-class'` and the UI language, which is all the server reads.
 * The token never goes into a subscription's `tokens[]`.
 */

export const PUSH_WORKER_URL = '/class-push-sw.js';
export const PUSH_WORKER_SCOPE = '/class-push/';
const PUSH_APP = 'join-class';
const ANSWER_KEY_PREFIX = 'class-push-answer:';
/** How long to wait for the push worker to become active before giving up. */
const WORKER_ACTIVE_TIMEOUT_MS = 10_000;

function environment(): PushEnvironment {
	const nav = navigator as Navigator & { standalone?: boolean };
	const ios =
		/iPad|iPhone|iPod/.test(nav.userAgent) ||
		(nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
	const standalone =
		nav.standalone === true ||
		(typeof window.matchMedia === 'function' &&
			window.matchMedia('(display-mode: standalone)').matches);

	return {
		hasNotification: 'Notification' in window,
		hasPushManager: 'PushManager' in window,
		hasServiceWorker: 'serviceWorker' in navigator,
		ios,
		standalone,
		permission: 'Notification' in window ? Notification.permission : null,
	};
}

export function pushSupport(): PushSupport {
	try {
		return pushSupportOf(environment());
	} catch {
		return 'unsupported';
	}
}

export function readPushAnswer(mainId: string): PushAnswer | null {
	try {
		const value = localStorage.getItem(`${ANSWER_KEY_PREFIX}${mainId}`);

		return value === 'yes' || value === 'no' ? value : null;
	} catch {
		return null;
	}
}

export function writePushAnswer(mainId: string, answer: PushAnswer): void {
	try {
		localStorage.setItem(`${ANSWER_KEY_PREFIX}${mainId}`, answer);
	} catch {
		// private mode: the question may come back next visit, nothing breaks
	}
}

function waitActive(registration: ServiceWorkerRegistration): Promise<void> {
	if (registration.active) return Promise.resolve();
	const worker = registration.installing ?? registration.waiting;

	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error('push worker did not activate')),
			WORKER_ACTIVE_TIMEOUT_MS,
		);
		worker?.addEventListener('statechange', () => {
			if (worker.state === 'activated') {
				clearTimeout(timer);
				resolve();
			}
		});
	});
}

/** Register the worker, take the token and save it. Resolves false when the device cannot push. */
export async function saveReplyPushToken(): Promise<boolean> {
	const uid = getUserState().user?.uid;
	if (!uid) return false;
	try {
		const registration = await navigator.serviceWorker.register(PUSH_WORKER_URL, {
			scope: PUSH_WORKER_SCOPE,
		});
		await waitActive(registration);
		const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
		if (!(await isSupported())) return false;
		const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
		const token = await getToken(getMessaging(app), {
			serviceWorkerRegistration: registration,
			...(vapidKey ? { vapidKey } : {}),
		});
		if (!token) return false;
		const now = Date.now();
		await setDoc(
			doc(db, Collections.pushNotifications, token),
			{
				token,
				userId: uid,
				app: PUSH_APP,
				language: getLang(),
				platform: 'web',
				lastUpdate: now,
				lastRefresh: now,
			},
			{ merge: true },
		);

		return true;
	} catch (error) {
		console.error(
			'[ReplyPush] saving the device failed',
			{ operation: 'replyPush.saveToken', uid },
			error,
		);

		return false;
	}
}

/** "Yes, tell me": the browser's own question, then the token. */
export async function enableReplyPush(mainId: string): Promise<PushSupport> {
	writePushAnswer(mainId, 'yes');
	try {
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';
		await saveReplyPushToken();

		return 'granted';
	} catch (error) {
		console.error(
			'[ReplyPush] permission failed',
			{ operation: 'replyPush.enable', mainId },
			error,
		);

		return 'unsupported';
	}
}

/**
 * A device whose browser already allows notifications refreshes its token when
 * a lesson opens (tokens rotate, and the token is per student, not per lesson).
 */
export function refreshReplyPush(): void {
	if (pushSupport() !== 'granted') return;
	void saveReplyPushToken();
}
