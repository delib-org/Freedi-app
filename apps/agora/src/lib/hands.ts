import m from 'mithril';
import { safeParse } from 'valibot';
import { db, doc, onSnapshot, Unsubscribe } from './firebase';
import {
	AGORA_LOTTERY,
	AgoraHandSchema,
	AgoraStage,
	Collections,
	createAgoraHandId,
	lotteryActive,
	resolveStagePlan,
	type AgoraSession,
	type AgoraStagePlanItem,
	type DealNotesResponse,
} from '@freedi/shared-types';
import { dealNotes } from './callables';
import { on, onSubscribersCleared } from './events';
import { canWriteStage } from './flows/stageAccess';
import { dealableCount, fillFingerprint, shouldRequestFill, visibleNotes } from './flows/handFlow';
import { getDeliberationState, type AgoraProposal } from './proposals';
import { getSessionState } from './session';

/**
 * The student's hand of dealt notes, per station.
 *
 * `agoraHands/${sessionId}--${uid}` is server-written by `agoraDealNotes`;
 * this module streams it, asks for a deal whenever a deal could change
 * something, and tells the views which notes to show. Nothing here decides
 * who gets what — that is `planDeal` on the server. See lib/flows/handFlow.ts.
 *
 * The asking is event-driven: a notes snapshot or a landed rating announces
 * itself on the bus, and the hand asks for every station the student has
 * written at. A late note therefore reaches the readers who have room for it
 * without anyone pressing anything; "draw more" is the student's own ask.
 */

interface HandState {
	/** parentId → dealt note ids, in deal order */
	hands: Record<string, string[]>;
	/** The hand doc has been read once (it may not exist yet — that is a hand of nothing) */
	loaded: boolean;
	/** parentId → the server said nothing is left to draw */
	poolExhausted: Record<string, boolean>;
}

const state: HandState = { hands: {}, loaded: false, poolExhausted: {} };

export function getHandState(): Readonly<HandState> {
	return state;
}

const ASK_DEBOUNCE_MS = 1500;

let unsubscribe: Unsubscribe | null = null;
let listeningKey = '';
const inFlight = new Set<string>();
/** parentId → the fingerprint of the last fill asked; the same shape is not asked twice */
const asked = new Map<string, string>();
let askTimer: ReturnType<typeof setTimeout> | null = null;

/** Stream my hand; rebinding to another session or user drops the old one */
export function listenToHand(sessionId: string, userId: string): void {
	const key = `${sessionId}--${userId}`;
	if (listeningKey === key) return;
	stopHandListener();
	listeningKey = key;
	unsubscribe = onSnapshot(
		doc(db, Collections.agoraHands, createAgoraHandId(sessionId, userId)),
		(snapshot) => {
			const parsed = safeParse(AgoraHandSchema, snapshot.data());
			state.hands = parsed.success ? parsed.output.hands : {};
			if (!snapshot.metadata.fromCache) state.loaded = true;
			// The first ask may have come before the doc was read; ask again now
			// that the hand is known (the fingerprint keeps it to one call)
			requestFill();
			m.redraw();
		},
		(error) => {
			console.error('[Hands] Hand listener failed:', error);
		},
	);
}

export function stopHandListener(): void {
	unsubscribe?.();
	unsubscribe = null;
	listeningKey = '';
	state.hands = {};
	state.loaded = false;
	state.poolExhausted = {};
	inFlight.clear();
	asked.clear();
}

/** The question whose notes a station's board holds — the key of the hand */
export function parentIdOf(session: AgoraSession, item: AgoraStagePlanItem): string | undefined {
	return [AgoraStage.deliberation, AgoraStage.voting, AgoraStage.results].includes(item.stage)
		? session.challengeQuestionId
		: item.statementId;
}

/** Large enough a class for the lottery — students only; the teacher holds no participant doc */
export function isLotteryActive(): boolean {
	return lotteryActive(getSessionState().participants.length);
}

/** The hand size while notes are dealt; undefined when everyone reads everyone */
export function activeHandSize(): number | undefined {
	return isLotteryActive() ? AGORA_LOTTERY.HAND_SIZE : undefined;
}

export function handFor(parentId: string | undefined): string[] {
	return parentId ? (state.hands[parentId] ?? []) : [];
}

function ratedIds(): Set<string> {
	return new Set(Object.keys(getDeliberationState().myRatings));
}

/** Every note under a station, the same list `stationNotes` reads (kept here so lib never imports a component) */
function notesUnder(session: AgoraSession, item: AgoraStagePlanItem): AgoraProposal[] {
	const delib = getDeliberationState();
	const parentId = parentIdOf(session, item);
	const all =
		parentId === session.challengeQuestionId
			? delib.proposals
			: parentId
				? (delib.answersByQuestion[parentId] ?? [])
				: [];

	return all.filter((note) => !note.hidden);
}

/** What this student's board shows at a station: mine, my hand, my ratings — or everything */
export function visibleStationNotes(item: AgoraStagePlanItem): AgoraProposal[] {
	const { session, myParticipant } = getSessionState();
	if (!session) return [];
	const notes = notesUnder(session, item);
	// Only a seated student holds a hand; the teacher watching the room has no
	// participant doc and, like any read-only viewer, sees every note
	const userId = myParticipant?.userId;
	if (!userId || userId === session.teacherId) return notes;

	return visibleNotes({
		notes,
		userId,
		hand: handFor(parentIdOf(session, item)),
		rated: ratedIds(),
		active: isLotteryActive(),
		live: canWriteStage(session, item.itemId),
	});
}

async function call(
	session: AgoraSession,
	parentId: string,
	mode: 'fill' | 'more',
): Promise<DealNotesResponse | null> {
	if (inFlight.has(parentId)) return null;
	inFlight.add(parentId);
	try {
		const result = await dealNotes({ sessionId: session.sessionId, parentId, mode });
		// Show the deal before the snapshot carries it back
		if (result.active) state.hands = { ...state.hands, [parentId]: result.hand };
		state.poolExhausted = { ...state.poolExhausted, [parentId]: result.poolExhausted };
		m.redraw();

		return result;
	} catch (error) {
		console.error('[Hands] Deal failed:', error);

		return null;
	} finally {
		inFlight.delete(parentId);
	}
}

/** Ask for a deal at every station I have written at, when a deal could change something */
function askWhereDue(): void {
	const { session, myParticipant } = getSessionState();
	const userId = myParticipant?.userId;
	if (!session || !userId || !state.loaded) return;
	const active = isLotteryActive();
	const rated = ratedIds();
	// resolveStagePlan: a session without a stored plan runs the legacy order
	const seen = new Set<string>();
	for (const item of resolveStagePlan(session)) {
		const parentId = parentIdOf(session, item);
		if (!parentId || seen.has(parentId)) continue;
		seen.add(parentId);
		const notes = notesUnder(session, item);
		const hand = handFor(parentId);
		const ask = {
			active,
			live: canWriteStage(session, item.itemId),
			hasMine: notes.some((note) => note.creatorId === userId),
			hand,
			rated,
			dealable: dealableCount(notes, userId, hand, rated),
		};
		if (!shouldRequestFill(ask)) continue;
		const fingerprint = fillFingerprint(ask);
		if (asked.get(parentId) === fingerprint) continue;
		asked.set(parentId, fingerprint);
		void call(session, parentId, 'fill');
	}
}

/** Debounced: a burst of snapshots is one question to the server */
export function requestFill(): void {
	if (askTimer) clearTimeout(askTimer);
	askTimer = setTimeout(() => {
		askTimer = null;
		askWhereDue();
	}, ASK_DEBOUNCE_MS);
}

/** The student's own ask: another hand's worth of the least-read notes */
export async function drawMore(parentId: string): Promise<void> {
	const session = getSessionState().session;
	if (!session) return;
	await call(session, parentId, 'more');
}

export function poolExhausted(parentId: string | undefined): boolean {
	return parentId ? (state.poolExhausted[parentId] ?? false) : false;
}

function subscribe(): void {
	on('statements:changed', ({ sessionId, userId }) => {
		listenToHand(sessionId, userId);
		requestFill();
	});
	on('rating:confirmed', () => requestFill());
}
subscribe();
onSubscribersCleared(subscribe);

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => requestFill());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') requestFill();
	});
}
