import m from 'mithril';

/**
 * The square's post box.
 *
 * Every piece of news in this game used to be a toast and nothing else: six
 * seconds on screen, then gone. A student mid-sentence (the queue holds toasts
 * while a textarea has focus, but not forever), or one who simply looked up at
 * the teacher, lost the fact that a classmate had answered them — and there was
 * nowhere to go and find out. The badges on the tabs count WORK still owed;
 * they cannot say what happened, when, or in whose conversation.
 *
 * So every toast now also lands here, keyed by the thing that caused it, and
 * each item knows where it points. The badge counts news not yet looked at, not
 * work outstanding — reading the list clears it, which keeps it from turning
 * into a nag (see the psychology guardrails in the motivation-system plan).
 */

export type InboxTarget =
	/** My own workshop — the received-ideas drawer */
	| { kind: 'mine' }
	/** One conversation, by proposal and the helper whose thread it is */
	| { kind: 'thread'; proposalId: string; helperUid: string }
	/** A classmate's proposal I helped — re-read it, weigh it again */
	| { kind: 'helped'; proposalId: string }
	/** The stalls, for news whose next step is "help someone else" */
	| { kind: 'market' };

export interface InboxItem {
	/** Stable, derived from the CAUSE (message id, notification id, edit clock) */
	id: string;
	trigger: string;
	at: number;
	read: boolean;
	target?: InboxTarget;
	/** The words the event carried, when it had any — an idea, a reply */
	detail?: string;
}

/** Enough to hold a lesson's news; the oldest fall off the end */
const MAX_ITEMS = 40;

let items: InboxItem[] = [];
let storageKey = '';

function persist(): void {
	if (!storageKey) return;
	try {
		sessionStorage.setItem(storageKey, JSON.stringify(items));
	} catch {
		// Storage full or blocked — the inbox still works for this sitting
	}
}

/** Bind the box to a session and restore what it already holds */
export function initInbox(sessionId: string): void {
	const key = `agora_${sessionId}_inbox`;
	if (storageKey === key) return;
	storageKey = key;
	try {
		const stored = sessionStorage.getItem(key);
		items = stored ? (JSON.parse(stored) as InboxItem[]) : [];
	} catch {
		items = [];
	}
}

/**
 * File one piece of news. Idempotent by id, which is why every caller derives
 * the id from the CAUSE: the detectors re-run on every snapshot, and an inbox
 * that grew a row per redraw would be worse than no inbox at all.
 */
export function addInboxItem(item: Omit<InboxItem, 'read' | 'at'> & { at?: number }): void {
	if (items.some((existing) => existing.id === item.id)) return;
	items.unshift({ ...item, at: item.at ?? Date.now(), read: false });
	if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
	persist();
}

/** Newest first — the order a post box is read in */
export function getInboxItems(): readonly InboxItem[] {
	return items;
}

export function inboxUnreadCount(): number {
	return items.reduce((count, item) => (item.read ? count : count + 1), 0);
}

export function markInboxRead(id: string): void {
	const item = items.find((candidate) => candidate.id === id);
	if (!item || item.read) return;
	item.read = true;
	persist();
	m.redraw();
}

/**
 * Everything currently in the box has been seen. Called when the panel
 * CLOSES, not when it opens: while it is open the unread marks are what tell
 * a student which lines are the new ones.
 */
export function markAllInboxRead(): void {
	let changed = false;
	for (const item of items) {
		if (!item.read) {
			item.read = true;
			changed = true;
		}
	}
	if (changed) {
		persist();
		m.redraw();
	}
}

/** Session over — the box belongs to the lesson that filled it */
export function clearInbox(): void {
	items = [];
	persist();
}
