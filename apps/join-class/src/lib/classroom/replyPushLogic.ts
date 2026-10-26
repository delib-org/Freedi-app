/**
 * Pure side of the reply push question (IA 22.7): can this device be asked,
 * and should it be asked now. No browser APIs here (see replyPush.ts).
 */

export type PushAnswer = 'yes' | 'no';
export type PushSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export interface PushEnvironment {
	hasNotification: boolean;
	hasPushManager: boolean;
	hasServiceWorker: boolean;
	ios: boolean;
	standalone: boolean;
	permission: NotificationPermission | null;
}

/** Pure: can this device be asked, and what has it already said? */
export function pushSupportOf(env: PushEnvironment): PushSupport {
	if (!env.hasNotification || !env.hasPushManager || !env.hasServiceWorker) return 'unsupported';
	if (env.ios && !env.standalone) return 'unsupported';
	if (env.permission === 'granted') return 'granted';
	if (env.permission === 'denied') return 'denied';

	return 'default';
}

/** Pure: the inline question shows only to a device that can push and was not asked in this lesson. */
export function shouldAskPush(support: PushSupport, answer: PushAnswer | null): boolean {
	return support === 'default' && answer === null;
}
