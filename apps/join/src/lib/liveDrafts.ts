import m from 'mithril';
import {
	getRtdb,
	rtdbRef,
	rtdbSet,
	rtdbUpdate,
	rtdbRemove,
	rtdbOnValue,
	rtdbOnDisconnect,
	OnDisconnect,
	RtdbUnsubscribe,
} from '@/lib/firebase';
import { getCreator } from '@/lib/store';

/**
 * Live draft broadcast — a participant composing a suggestion can stream
 * their draft letter-by-letter to everyone viewing the same sub-question,
 * so the table can help them shape it while others write their own.
 *
 * Transport is Realtime Database (keystroke-rate writes are too chatty for
 * Firestore). Path shape, mirrored in database.rules.json:
 *
 *   liveDrafts/{questionId}/{broadcasterUid} = {
 *     userId, displayName, color, text, lastUpdate, ttl,
 *     reactions/{reactorUid} = { emoji, displayName, timestamp }
 *   }
 *
 * The whole module no-ops when RTDB isn't configured (getRtdb() === null),
 * so environments without VITE_FIREBASE_DATABASE_URL degrade silently.
 */

const DEBOUNCE_MS = 300;
// Must match SESSION_TTL_MS in functions/src/fn_cleanupStaleEditingSessions.ts
// so the scheduled sweep and the client agree on when a draft is dead.
const TTL_MS = 15 * 60 * 1000;
// While broadcasting, refresh lastUpdate/ttl so a pausing ("thinking")
// writer stays visible past the viewers' stale filter.
const HEARTBEAT_MS = 45_000;
// Viewers hide drafts whose lastUpdate is older than this (covers crashed
// clients whose onDisconnect never fired, before the server sweep runs).
const STALE_MS = 120_000;
const REACTION_FRESH_MS = 15_000;
const REACTION_THROTTLE_MS = 1_000;
const MAX_TEXT = 10_000;

// Same palette as the Sign app's live editing sessions (apps cannot import
// across apps, so the eight values are duplicated by design).
const BROADCASTER_COLORS = [
	'#3b82f6', // blue
	'#ef4444', // red
	'#10b981', // green
	'#f59e0b', // amber
	'#8b5cf6', // purple
	'#ec4899', // pink
	'#14b8a6', // teal
	'#f97316', // orange
];

export interface LiveReaction {
	reactorId: string;
	emoji: string;
	displayName: string;
	timestamp: number;
}

export interface LiveDraft {
	userId: string;
	displayName: string;
	color: string;
	text: string;
	lastUpdate: number;
	reactions: LiveReaction[];
}

interface RawReaction {
	emoji?: unknown;
	displayName?: unknown;
	timestamp?: unknown;
}

interface RawDraft {
	userId?: unknown;
	displayName?: unknown;
	color?: unknown;
	text?: unknown;
	lastUpdate?: unknown;
	ttl?: unknown;
	reactions?: Record<string, RawReaction>;
}

let currentQuestionId: string | null = null;
let unsubscribe: RtdbUnsubscribe | null = null;
let drafts: Record<string, LiveDraft> = {};
let broadcasting = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let myDisconnect: OnDisconnect | null = null;
let pendingText: string | null = null;
let lastReactionAt = 0;
let visibilityHandler: (() => void) | null = null;
let reactionExpiryTimer: ReturnType<typeof setTimeout> | null = null;

export function getUserColor(userId: string): string {
	const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

	return BROADCASTER_COLORS[hash % BROADCASTER_COLORS.length];
}

function parseDrafts(value: unknown): Record<string, LiveDraft> {
	const parsed: Record<string, LiveDraft> = {};
	if (!value || typeof value !== 'object') return parsed;

	for (const [uid, raw] of Object.entries(value as Record<string, RawDraft>)) {
		if (!raw || typeof raw !== 'object') continue;
		if (typeof raw.userId !== 'string' || typeof raw.lastUpdate !== 'number') continue;

		const reactions: LiveReaction[] = [];
		if (raw.reactions && typeof raw.reactions === 'object') {
			for (const [reactorId, r] of Object.entries(raw.reactions)) {
				if (!r || typeof r.emoji !== 'string' || typeof r.timestamp !== 'number') continue;
				reactions.push({
					reactorId,
					emoji: r.emoji,
					displayName: typeof r.displayName === 'string' ? r.displayName : '',
					timestamp: r.timestamp,
				});
			}
			reactions.sort((a, b) => b.timestamp - a.timestamp);
		}

		parsed[uid] = {
			userId: raw.userId,
			displayName: typeof raw.displayName === 'string' ? raw.displayName : 'Anonymous',
			color: typeof raw.color === 'string' ? raw.color : getUserColor(uid),
			text: typeof raw.text === 'string' ? raw.text : '',
			lastUpdate: raw.lastUpdate,
			reactions,
		};
	}

	return parsed;
}

/** Attach the watcher for one sub-question. Idempotent per questionId; a
 *  different questionId tears the previous state down first (including any
 *  broadcast still running — leaving the question always ends the session). */
export function initLiveDrafts(questionId: string): void {
	if (currentQuestionId === questionId && unsubscribe) return;

	teardownLiveDrafts();

	const rtdb = getRtdb();
	if (!rtdb) return;

	currentQuestionId = questionId;
	unsubscribe = rtdbOnValue(
		rtdbRef(rtdb, `liveDrafts/${questionId}`),
		(snapshot) => {
			drafts = parseDrafts(snapshot.val());
			scheduleReactionExpiry();
			m.redraw();
		},
		(error) => {
			console.error('[liveDrafts] listener error:', error);
		},
	);
}

export function teardownLiveDrafts(): void {
	if (broadcasting) void stopBroadcast();
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
	if (reactionExpiryTimer) {
		clearTimeout(reactionExpiryTimer);
		reactionExpiryTimer = null;
	}
	currentQuestionId = null;
	drafts = {};
	lastReactionAt = 0;
}

/** RTDB only pushes when a reaction *arrives*; nothing tells us when one goes
 *  stale. Wake up exactly once, at the moment the next fresh reaction expires,
 *  so cheer chips clear themselves instead of sticking around forever — and so
 *  we don't poll a timer for the 99% of the time nobody is reacting. */
function scheduleReactionExpiry(): void {
	if (reactionExpiryTimer) {
		clearTimeout(reactionExpiryTimer);
		reactionExpiryTimer = null;
	}

	const now = Date.now();
	let soonest = Infinity;
	for (const draft of Object.values(drafts)) {
		for (const reaction of draft.reactions) {
			const expiresAt = reaction.timestamp + REACTION_FRESH_MS;
			if (expiresAt > now && expiresAt < soonest) soonest = expiresAt;
		}
	}
	if (soonest === Infinity) return;

	reactionExpiryTimer = setTimeout(
		() => {
			reactionExpiryTimer = null;
			m.redraw();
			scheduleReactionExpiry();
		},
		soonest - now + 50,
	);
}

function myDraftPath(): string | null {
	const creator = getCreator();
	if (!currentQuestionId || !creator) return null;

	return `liveDrafts/${currentQuestionId}/${creator.uid}`;
}

/** Start streaming the composer's draft to everyone on this sub-question. */
export async function startBroadcast(initialText: string): Promise<void> {
	const rtdb = getRtdb();
	const creator = getCreator();
	const path = myDraftPath();
	if (!rtdb || !creator || !path || broadcasting) return;

	const now = Date.now();
	const node = rtdbRef(rtdb, path);

	try {
		await rtdbSet(node, {
			userId: creator.uid,
			displayName: creator.displayName || 'Anonymous',
			color: getUserColor(creator.uid),
			text: initialText.slice(0, MAX_TEXT),
			lastUpdate: now,
			ttl: now + TTL_MS,
		});

		myDisconnect = rtdbOnDisconnect(node);
		await myDisconnect.remove();

		broadcasting = true;
		heartbeatTimer = setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);

		// Belt-and-braces: RTDB re-arms onDisconnect on reconnect by itself,
		// but an immediate heartbeat on tab return refreshes staleness fast.
		if (typeof document !== 'undefined') {
			visibilityHandler = () => {
				if (document.visibilityState === 'visible' && broadcasting) void sendHeartbeat();
			};
			document.addEventListener('visibilitychange', visibilityHandler);
		}

		m.redraw();
	} catch (error) {
		console.error('[liveDrafts] startBroadcast failed:', error);
	}
}

async function sendHeartbeat(): Promise<void> {
	const rtdb = getRtdb();
	const path = myDraftPath();
	if (!rtdb || !path || !broadcasting) return;

	const now = Date.now();
	try {
		await rtdbUpdate(rtdbRef(rtdb, path), { lastUpdate: now, ttl: now + TTL_MS });
	} catch (error) {
		console.error('[liveDrafts] heartbeat failed:', error);
	}
}

/** Trailing-debounced text push — call on every keystroke. */
export function updateBroadcastText(text: string): void {
	if (!broadcasting) return;

	pendingText = text;
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		void flushPendingText();
	}, DEBOUNCE_MS);
}

async function flushPendingText(): Promise<void> {
	const rtdb = getRtdb();
	const path = myDraftPath();
	if (!rtdb || !path || !broadcasting || pendingText === null) return;

	const text = pendingText.slice(0, MAX_TEXT);
	pendingText = null;
	const now = Date.now();

	try {
		await rtdbUpdate(rtdbRef(rtdb, path), { text, lastUpdate: now, ttl: now + TTL_MS });
	} catch (error) {
		console.error('[liveDrafts] text update failed:', error);
	}
}

export async function stopBroadcast(): Promise<void> {
	if (!broadcasting) return;
	broadcasting = false;

	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
	if (visibilityHandler && typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', visibilityHandler);
		visibilityHandler = null;
	}
	pendingText = null;

	const rtdb = getRtdb();
	const path = myDraftPath();

	try {
		if (myDisconnect) {
			await myDisconnect.cancel();
			myDisconnect = null;
		}
		if (rtdb && path) await rtdbRemove(rtdbRef(rtdb, path));
	} catch (error) {
		console.error('[liveDrafts] stopBroadcast failed:', error);
	}

	m.redraw();
}

export function isBroadcasting(): boolean {
	return broadcasting;
}

/** Live drafts on the current sub-question, stale-filtered. Sorted by uid —
 *  a stable order, so cards don't jump around as people type. */
export function getLiveDrafts(opts?: { excludeSelf?: boolean }): LiveDraft[] {
	const cutoff = Date.now() - STALE_MS;
	const selfUid = opts?.excludeSelf ? getCreator()?.uid : undefined;

	return Object.values(drafts)
		.filter((d) => d.lastUpdate > cutoff && d.userId !== selfUid)
		.sort((a, b) => a.userId.localeCompare(b.userId));
}

/** Send (or replace) my reaction on a broadcaster's draft. */
export async function sendReaction(broadcasterId: string, emoji: string): Promise<void> {
	const rtdb = getRtdb();
	const creator = getCreator();
	if (!rtdb || !creator || !currentQuestionId) return;

	const now = Date.now();
	if (now - lastReactionAt < REACTION_THROTTLE_MS) return;
	lastReactionAt = now;

	const path = `liveDrafts/${currentQuestionId}/${broadcasterId}/reactions/${creator.uid}`;
	try {
		await rtdbSet(rtdbRef(rtdb, path), {
			emoji,
			displayName: creator.displayName || 'Anonymous',
			timestamp: now,
		});
	} catch (error) {
		console.error('[liveDrafts] sendReaction failed:', error);
	}
}

/** Reactions recent enough to display as live chips. */
export function getRecentReactions(draft: LiveDraft): LiveReaction[] {
	const cutoff = Date.now() - REACTION_FRESH_MS;

	return draft.reactions.filter((r) => r.timestamp > cutoff);
}

/** Cheers landing on *my* draft while I write. The watcher listens to the whole
 *  question, so a broadcaster already holds their own node — this just picks it
 *  out, letting the composer show the writer what the table is sending back. */
export function getMyRecentReactions(): LiveReaction[] {
	const uid = getCreator()?.uid;
	if (!uid) return [];

	const mine = drafts[uid];

	return mine ? getRecentReactions(mine) : [];
}
