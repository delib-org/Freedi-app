import m from 'mithril';
import { db, doc, collection, query, where, onSnapshot, updateDoc, Unsubscribe } from './firebase';
import { Collections, NotificationTriggerType, SourceApp } from '@freedi/shared-types';
import { t } from './i18n';
import { celebrate } from './celebration';
import { getDeliberationState } from './proposals';

export interface AgoraToast {
	notificationId: string;
	triggerType: string;
	text: string;
}

const toasts: AgoraToast[] = [];
let unsubscribe: Unsubscribe | null = null;
let listeningUserId = '';

export function getToasts(): readonly AgoraToast[] {
	return toasts;
}

export function dismissToast(notificationId: string): void {
	const index = toasts.findIndex((toast) => toast.notificationId === notificationId);
	if (index >= 0) toasts.splice(index, 1);
	updateDoc(doc(db, Collections.inAppNotifications, notificationId), {
		read: true,
		readAt: Date.now(),
	}).catch((error: unknown) => {
		console.error('[Notifications] Marking read failed:', error);
	});
	m.redraw();
}

const TOAST_AUTO_DISMISS_MS = 6000;

/** Listen to this user's unread agora notifications and surface them as toasts */
export function listenToNotifications(userId: string): void {
	if (listeningUserId === userId) return;
	stopNotifications();
	listeningUserId = userId;

	unsubscribe = onSnapshot(
		query(
			collection(db, Collections.inAppNotifications),
			where('userId', '==', userId),
			where('sourceApp', '==', SourceApp.AGORA),
			where('read', '==', false),
		),
		(snapshot) => {
			snapshot.docChanges().forEach((change) => {
				if (change.type !== 'added') return;
				const data = change.doc.data() as {
					notificationId?: string;
					triggerType?: string;
					text?: string;
					statementId?: string;
				};
				if (!data.notificationId) return;

				// An accepted improvement deserves glitter, not a toast: pop the
				// celebration with the suggestion text (already in the local
				// deliberation state) and mark the notification read.
				if (data.triggerType === NotificationTriggerType.AGORA_SUGGESTION_ACCEPTED) {
					const suggestion = Object.values(getDeliberationState().suggestions)
						.flat()
						.find((candidate) => candidate.statementId === data.statementId);
					celebrate({
						message: t('celebrate.suggestion_accepted'),
						detail: suggestion?.statement,
					});
					updateDoc(doc(db, Collections.inAppNotifications, data.notificationId), {
						read: true,
						readAt: Date.now(),
					}).catch((error: unknown) => {
						console.error('[Notifications] Marking read failed:', error);
					});

					return;
				}

				if (toasts.some((toast) => toast.notificationId === data.notificationId)) return;
				const toast: AgoraToast = {
					notificationId: data.notificationId,
					triggerType: data.triggerType ?? '',
					text: data.text ?? '',
				};
				toasts.push(toast);
				setTimeout(() => dismissToast(toast.notificationId), TOAST_AUTO_DISMISS_MS);
			});
			m.redraw();
		},
		(error) => {
			console.error('[Notifications] Listener failed:', error);
		},
	);
}

export function stopNotifications(): void {
	if (unsubscribe) unsubscribe();
	unsubscribe = null;
	listeningUserId = '';
	toasts.length = 0;
}
