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
	// Local toasts have no Firestore doc behind them
	if (!notificationId.startsWith('local--')) {
		updateDoc(doc(db, Collections.inAppNotifications, notificationId), {
			read: true,
			readAt: Date.now(),
		}).catch((error: unknown) => {
			console.error('[Notifications] Marking read failed:', error);
		});
	}
	m.redraw();
}

const TOAST_AUTO_DISMISS_MS = 6000;

let localToastCounter = 0;

/** Client-detected event → toast, without a backing notification doc */
export function pushLocalToast(triggerType: string): void {
	const toast: AgoraToast = {
		notificationId: `local--${++localToastCounter}`,
		triggerType,
		text: '',
	};
	toasts.push(toast);
	setTimeout(() => dismissToast(toast.notificationId), TOAST_AUTO_DISMISS_MS);
	m.redraw();
}

/**
 * The collaboration loop's "come back" signal: when a proposal I sent a
 * suggestion on gets edited, toast me. Watermarked per session in
 * sessionStorage; the first observation of a proposal initializes silently
 * so fresh tabs don't replay history.
 * (Called from the proposals statements listener — the proposals ↔
 * notifications import cycle is call-time-only and benign.)
 */
export function detectHelpedImprovements(sessionId: string, userId: string): void {
	const key = `agora_${sessionId}_helped_toastmark`;
	let marks: Record<string, number> = {};
	try {
		marks = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, number>;
	} catch {
		// Corrupt storage — start over
	}

	const { proposals, suggestions } = getDeliberationState();
	let changed = false;
	let toastDue = false;
	for (const proposal of proposals) {
		if (proposal.creatorId === userId) continue;
		const mine = (suggestions[proposal.statementId] ?? []).filter(
			(suggestion) => suggestion.creatorId === userId,
		);
		if (mine.length === 0) continue;
		const mark = marks[proposal.statementId];
		if (mark === undefined) {
			// First sighting: remember where we are, no toast
			marks[proposal.statementId] = proposal.lastUpdate;
			changed = true;
		} else if (proposal.lastUpdate > mark) {
			marks[proposal.statementId] = proposal.lastUpdate;
			changed = true;
			toastDue = true;
		}
	}
	if (changed) sessionStorage.setItem(key, JSON.stringify(marks));
	if (toastDue) pushLocalToast('agora_helped_improved');
}

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
