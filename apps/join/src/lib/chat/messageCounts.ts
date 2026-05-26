/**
 * Per-option chat-message accounting.
 *
 * Three Maps keyed by optionId track everything the UI needs to render the
 * "N new messages" badge on each option card:
 *   • `messageCounts`    — total messages on this option
 *   • `messageLatest`    — timestamp of the most recent message
 *   • `messagesByOption` — every message timestamp (used for unread count
 *                          relative to the user's `lastRead` per option)
 *
 * Subscriptions are batched (Firestore's `in` clause maxes out at 30 ids)
 * and the entire set of subscriptions is replaced when the option list
 * changes — `subscribeMessageCounts(allOptionIds)` is the only public entry.
 *
 * Per-option "last read" timestamps live in localStorage and are read on
 * every `getNewMessageCount()` call. Cheap on a phone (one key, one parse)
 * and means a tab refresh doesn't reset the user's read state.
 */

import m from 'mithril';
import { Statement, StatementType, Collections } from '@freedi/shared-types';
import { db, collection, query, where, onSnapshot, Unsubscribe } from '../firebase';

const LAST_READ_KEY = 'freedi_join_last_read';
const BATCH_SIZE = 30;

const messageCounts: Map<string, number> = new Map();
const messageLatest: Map<string, number> = new Map();
const messagesByOption: Map<string, number[]> = new Map();
let messageCountsUnsubs: Unsubscribe[] = [];

/** Total messages on an option. */
export function getMessageCount(optionId: string): number {
	return messageCounts.get(optionId) ?? 0;
}

/**
 * Messages on this option since the user last viewed it. Falls back to the
 * total count when no last-read entry exists (first visit ever).
 */
export function getNewMessageCount(optionId: string): number {
	const lastRead = getLastReadMap()[optionId];
	if (!lastRead) return messageCounts.get(optionId) ?? 0;

	const latest = messageLatest.get(optionId);
	if (!latest || latest <= lastRead) return 0;

	const allMsgs = messagesByOption.get(optionId);
	if (!allMsgs) return 0;

	return allMsgs.filter((ts) => ts > lastRead).length;
}

/** Stamp `now` into the per-option last-read map. Called when the user opens an option's chat. */
export function markOptionChatRead(optionId: string): void {
	try {
		const map = getLastReadMap();
		map[optionId] = Date.now();
		localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
	} catch {
		/* localStorage unavailable (private mode, quota) — silently ignore */
	}
}

function getLastReadMap(): Record<string, number> {
	try {
		const raw = localStorage.getItem(LAST_READ_KEY);
		if (raw) return JSON.parse(raw);
	} catch {
		/* ignore — corrupted JSON or unavailable storage */
	}

	return {};
}

/**
 * Replace the current subscription set so it covers exactly `optionIds`.
 * Tears down all prior listeners before mounting new ones. Triggers a
 * redraw on every snapshot.
 */
export function subscribeMessageCounts(optionIds: string[]): void {
	for (const unsub of messageCountsUnsubs) unsub();
	messageCountsUnsubs = [];

	if (optionIds.length === 0) return;

	for (let i = 0; i < optionIds.length; i += BATCH_SIZE) {
		const batch = optionIds.slice(i, i + BATCH_SIZE);

		const chatQuery = query(
			collection(db, Collections.statements),
			where('parentId', 'in', batch),
			where('statementType', '==', StatementType.statement),
		);

		const unsub = onSnapshot(chatQuery, (snap) => {
			// Clear this batch's entries before re-counting so a deleted
			// message decrements the counter correctly.
			for (const id of batch) {
				messageCounts.delete(id);
				messageLatest.delete(id);
				messagesByOption.delete(id);
			}

			for (const d of snap.docs) {
				const data = d.data() as Statement;
				const pid = data.parentId;
				messageCounts.set(pid, (messageCounts.get(pid) ?? 0) + 1);

				const ts = data.createdAt ?? 0;
				const existing = messageLatest.get(pid) ?? 0;
				if (ts > existing) messageLatest.set(pid, ts);

				const arr = messagesByOption.get(pid) ?? [];
				arr.push(ts);
				messagesByOption.set(pid, arr);
			}
			m.redraw();
		});

		messageCountsUnsubs.push(unsub);
	}
}
