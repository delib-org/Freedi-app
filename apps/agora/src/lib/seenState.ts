import { db, doc, updateDoc } from './firebase';
import { Collections, createAgoraParticipantId } from '@freedi/shared-types';
import { getSessionState } from './session';
import { getDeliberationState } from './proposals';
import { getUserState } from './user';

/**
 * Durable change-awareness watermarks, stored on the student's
 * agoraParticipants doc so NEW / EDITED chips survive refresh and device
 * switches. The doc is canonical; a local pending overlay makes chips clear
 * the instant the student engages, before the debounced write lands.
 *
 * Every merge is a monotonic max — a stale tab or second device can advance
 * a watermark but never rewind one.
 */

interface SeenEntry {
	firstSeenAt: number;
	seenEditAt: number;
}

const FLUSH_DEBOUNCE_MS = 2500;

let boundKey = '';
let pendingSeen: Record<string, SeenEntry> = {};
let pendingThreads: Record<string, number> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let baselineSeededFor = '';

/** Rebind to the active session/user; a switch drops stale pending state */
function ensureBound(): { sessionId: string; userId: string } | null {
	const sessionId = getSessionState().session?.sessionId;
	const userId = getUserState().user?.uid;
	if (!sessionId || !userId) return null;
	const key = `${sessionId}--${userId}`;
	if (boundKey !== key) {
		boundKey = key;
		pendingSeen = {};
		pendingThreads = {};
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
	}

	return { sessionId, userId };
}

function serverSeen(): Record<string, SeenEntry> {
	return getSessionState().myParticipant?.seen ?? {};
}

function serverThreads(): Record<string, number> {
	return getSessionState().myParticipant?.seenThreads ?? {};
}

/** Doc value overlaid with pending marks — what the chips actually read */
function effectiveSeen(proposalId: string): SeenEntry | undefined {
	const fromServer = serverSeen()[proposalId];
	const fromPending = pendingSeen[proposalId];
	if (!fromServer) return fromPending;
	if (!fromPending) return fromServer;

	return {
		firstSeenAt: Math.min(fromServer.firstSeenAt, fromPending.firstSeenAt),
		seenEditAt: Math.max(fromServer.seenEditAt, fromPending.seenEditAt),
	};
}

function effectiveThreadSeen(threadKey: string): number {
	return Math.max(serverThreads()[threadKey] ?? 0, pendingThreads[threadKey] ?? 0);
}

/**
 * Never seen, never rated. The rating fallback keeps the rollout silent:
 * students who evaluated before seen-state existed don't get a wall of NEW.
 */
export function isNewToMe(proposalId: string): boolean {
	ensureBound();
	if (effectiveSeen(proposalId)) return false;

	return !getDeliberationState().myRatings[proposalId];
}

/**
 * The owner really edited (agoraScores.lastEditAt — the only trustworthy edit
 * clock) since I last acknowledged the card. False when never seen: NEW wins.
 */
export function isEditedSinceSeen(proposalId: string, lastEditAt: number | undefined): boolean {
	ensureBound();
	if (!lastEditAt) return false;
	const entry = effectiveSeen(proposalId);
	if (!entry) return false;

	return lastEditAt > entry.seenEditAt;
}

/** The seenEditAt watermark, or undefined when the proposal was never seen */
export function seenEditWatermark(proposalId: string): number | undefined {
	ensureBound();

	return effectiveSeen(proposalId)?.seenEditAt;
}

/** Acknowledge a proposal card (opened it, or rated it) up to `editAt` */
export function markProposalSeen(proposalId: string, editAt: number | undefined): void {
	if (!ensureBound()) return;
	const current = effectiveSeen(proposalId);
	const targetEditAt = Math.max(editAt ?? 0, current?.seenEditAt ?? 0);
	if (current && current.seenEditAt >= targetEditAt) return;
	pendingSeen[proposalId] = {
		firstSeenAt: current?.firstSeenAt ?? Date.now(),
		seenEditAt: targetEditAt,
	};
	scheduleFlush();
}

/** Acknowledge a thread up to the newest message the student has read */
export function markThreadSeen(threadKey: string, newestCreatedAt: number): void {
	if (!ensureBound()) return;
	if (effectiveThreadSeen(threadKey) >= newestCreatedAt) return;
	pendingThreads[threadKey] = newestCreatedAt;
	scheduleFlush();
}

/** Messages addressed to me that arrived after my thread watermark */
export function threadUnreadCount(
	threadKey: string,
	messages: ReadonlyArray<{ creatorId: string; createdAt: number }>,
	myUid: string,
): number {
	ensureBound();
	const watermark = effectiveThreadSeen(threadKey);

	return messages.filter((message) => message.creatorId !== myUid && message.createdAt > watermark)
		.length;
}

/**
 * One-time migration for sessions already in flight: a participant with no
 * `seen` field gets entries for everything they already rated, so turning
 * the feature on mid-game doesn't shout NEW at half the square.
 */
export function seedSeenBaselineIfNeeded(): void {
	const bound = ensureBound();
	if (!bound) return;
	if (baselineSeededFor === boundKey) return;
	const { myParticipant } = getSessionState();
	const delib = getDeliberationState();
	if (!myParticipant || !delib.evaluationsLoaded || !delib.statementsLoaded) return;
	baselineSeededFor = boundKey;
	if (myParticipant.seen) return;
	for (const proposal of delib.proposals) {
		const rating = delib.myRatings[proposal.statementId];
		if (!rating) continue;
		pendingSeen[proposal.statementId] = {
			firstSeenAt: rating.updatedAt || Date.now(),
			seenEditAt: delib.scores[proposal.statementId]?.lastEditAt ?? 0,
		};
	}
	if (Object.keys(pendingSeen).length > 0) scheduleFlush();
}

function scheduleFlush(): void {
	if (flushTimer) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		void flushSeenState();
	}, FLUSH_DEBOUNCE_MS);
}

/**
 * Write pending marks that still advance past the streamed doc, as nested
 * field paths (merge, never a whole-map overwrite). Deliberately does NOT
 * bump lastActive: every participant write fans out to the whole class.
 */
export async function flushSeenState(): Promise<void> {
	const bound = ensureBound();
	if (!bound) return;
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	const server = serverSeen();
	const serverThreadMap = serverThreads();
	const payload: Record<string, SeenEntry | number> = {};
	for (const [proposalId, entry] of Object.entries(pendingSeen)) {
		const existing = server[proposalId];
		if (existing && existing.seenEditAt >= entry.seenEditAt) continue;
		payload[`seen.${proposalId}`] = existing
			? {
					firstSeenAt: Math.min(existing.firstSeenAt, entry.firstSeenAt),
					seenEditAt: Math.max(existing.seenEditAt, entry.seenEditAt),
				}
			: entry;
	}
	for (const [threadKey, watermark] of Object.entries(pendingThreads)) {
		if ((serverThreadMap[threadKey] ?? 0) >= watermark) continue;
		payload[`seenThreads.${threadKey}`] = watermark;
	}
	if (Object.keys(payload).length === 0) return;
	const participantId = createAgoraParticipantId(bound.sessionId, bound.userId);
	try {
		await updateDoc(doc(db, Collections.agoraParticipants, participantId), payload);
	} catch (error) {
		// Watermarks are a courtesy; the pending overlay keeps the UI honest
		// and the next mark reschedules a flush
		console.error('[SeenState] Flush failed:', error);
	}
}

// A hidden or closing tab is the last chance to persist what the student saw
if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flushSeenState();
	});
	window.addEventListener('pagehide', () => {
		void flushSeenState();
	});
}
