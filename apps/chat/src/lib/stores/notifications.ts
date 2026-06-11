/**
 * In-app notification store — pure Svelte stores, NO Firebase. The live listener
 * (`$lib/notifications.ts`) feeds this; components read it. Keeping it
 * Firebase-free means it can be seeded server-side (SSR first paint) and unit
 * tested without the SDK.
 */
import { derived, writable, get } from 'svelte/store';
import type { NotificationType } from '@freedi/shared-types';

/** Most-recent-first list of the signed-in user's notifications. */
export const notifications = writable<NotificationType[]>([]);

/** Unread count drives the bell badge. */
export const unreadCount = derived(notifications, ($n) => $n.filter((x) => !x.read).length);

/** Transient foreground toasts (a push that arrived while the tab is focused). */
export interface Toast {
	id: string;
	title: string;
	body: string;
	targetPath?: string;
}
export const toasts = writable<Toast[]>([]);

/** Replace the whole list (used for the SSR seed and the snapshot's full sync). */
export function setNotifications(next: NotificationType[]): void {
	notifications.set(sortByCreatedDesc(next));
}

/** Merge/patch notifications by id (used by incremental snapshot changes). */
export function upsertNotifications(changed: NotificationType[]): void {
	if (changed.length === 0) return;
	notifications.update((current) => {
		const byId = new Map(current.map((n) => [n.notificationId, n]));
		for (const n of changed) byId.set(n.notificationId, n);

		return sortByCreatedDesc([...byId.values()]);
	});
}

/** Remove notifications by id (snapshot 'removed'). */
export function removeNotifications(ids: string[]): void {
	if (ids.length === 0) return;
	const drop = new Set(ids);
	notifications.update((current) => current.filter((n) => !drop.has(n.notificationId)));
}

/** Optimistically mark ids read in the store (the server write is authoritative). */
export function markReadLocally(ids: string[]): void {
	const mark = new Set(ids);
	const now = Date.now();
	notifications.update((current) =>
		current.map((n) => (mark.has(n.notificationId) ? { ...n, read: true, readAt: now } : n)),
	);
}

/** Optimistically mark everything read in the store. */
export function markAllReadLocally(): void {
	const now = Date.now();
	notifications.update((current) =>
		current.map((n) => (n.read ? n : { ...n, read: true, readAt: now })),
	);
}

/** Ids of every currently-unread notification (for "mark all read"). */
export function unreadIds(): string[] {
	return get(notifications)
		.filter((n) => !n.read)
		.map((n) => n.notificationId);
}

let toastSeq = 0;
export function pushToast(toast: Omit<Toast, 'id'>): void {
	const id = `toast-${++toastSeq}`;
	toasts.update((list) => [...list, { ...toast, id }]);
}
export function dismissToast(id: string): void {
	toasts.update((list) => list.filter((t) => t.id !== id));
}

function sortByCreatedDesc(list: NotificationType[]): NotificationType[] {
	return [...list].sort((a, b) => b.createdAt - a.createdAt);
}
