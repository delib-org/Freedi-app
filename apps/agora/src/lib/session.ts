import m from 'mithril';
import { db, doc, collection, query, where, onSnapshot, updateDoc, Unsubscribe } from './firebase';
import {
	Collections,
	AgoraSession,
	AgoraParticipant,
	AgoraSessionSchema,
	AgoraParticipantSchema,
	AgoraStage,
	AgoraSessionMode,
	AgoraCampCensus,
	ResolvedSessionFlow,
	consensusPoolFrom,
	createAgoraParticipantId,
	resolveSessionFlow,
	tallyAgoraCamps,
} from '@freedi/shared-types';
import { AGORA_THEME_COLOR, ODYSSEY_THEME, ODYSSEY_THEME_COLOR } from './theme';
import { parse } from 'valibot';

export interface SessionState {
	session: AgoraSession | null;
	participants: AgoraParticipant[];
	myParticipant: AgoraParticipant | null;
	/**
	 * First participants snapshot arrived — only then does a missing
	 * `myParticipant` mean "this browser never joined" rather than "the
	 * roster is still loading". Without it the game can't tell a slow
	 * network from a student who isn't enrolled, and spins on both.
	 */
	participantsLoaded: boolean;
	loading: boolean;
	error: string | null;
}

const state: SessionState = {
	session: null,
	participants: [],
	myParticipant: null,
	participantsLoaded: false,
	loading: false,
	error: null,
};

let unsubscribers: Unsubscribe[] = [];
let listeningSessionId: string | null = null;

export function getSessionState(): Readonly<SessionState> {
	return state;
}

/**
 * Which beats this session runs.
 *
 * Every view asks here rather than testing `sessionMode === civic` where it
 * stands. Those tests were the same question asked in eight places, and once
 * an organizer can answer it differently per event, eight copies of the
 * question is eight chances to disagree about one room.
 *
 * Memoised on the session object identity — the snapshot handler replaces it
 * on every write, so this recomputes exactly when the session changes and not
 * once per render.
 */
let flowCacheKey: AgoraSession | null = null;
let flowCache: ResolvedSessionFlow = resolveSessionFlow({});

export function getSessionFlow(): ResolvedSessionFlow {
	if (state.session !== flowCacheKey) {
		flowCacheKey = state.session;
		flowCache = resolveSessionFlow(state.session ?? {});
	}

	return flowCache;
}

/**
 * Dress the app in the colours of the place the player came from.
 *
 * A civic square was opened from an Odyssey island and is usually reached by
 * walking out of one, so arriving in a different palette reads as a different
 * product rather than the next room of the same one. The attribute goes on the
 * document element, next to `dir` and `lang`, because the theme is a property
 * of the whole page and not of any one view.
 *
 * The join route sets this from the gate's own URL before the session has
 * loaded; this call is the correction, and it runs on every snapshot so a
 * session that is re-scripted mid-event repaints with it.
 */
export function applySessionTheme(session: AgoraSession | null): void {
	if (typeof document === 'undefined') return;
	const odyssey = session?.sessionMode === AgoraSessionMode.civic;

	if (odyssey) {
		document.documentElement.dataset.sessionTheme = ODYSSEY_THEME;
	} else if (session) {
		// Only a session we have actually read may take the theme OFF — absent
		// state must leave the join route's guess alone, or every civic square
		// flashes purple before its own colours arrive.
		delete document.documentElement.dataset.sessionTheme;
	}

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta && session) {
		meta.setAttribute('content', odyssey ? ODYSSEY_THEME_COLOR : AGORA_THEME_COLOR);
	}
}

/**
 * The pool the class consensus divides by.
 *
 * The client computes this so the results tab moves the instant a classmate
 * rates, instead of waiting for the trigger to write the score back. Both the
 * counting and the folding-in of unpositioned students now come from
 * shared-types, so the live number and the stored one cannot disagree on
 * anything but freshness.
 *
 * They used to. This function counted positioned students only, while the
 * trigger also folded the unpositioned into centre — so with even one student
 * yet to position, the teacher's projector and the class's phones showed
 * different consensus for the same proposal.
 */
export function getConsensusPool(): AgoraCampCensus {
	return consensusPoolFrom(tallyAgoraCamps(state.participants));
}

/**
 * Attach realtime listeners for a session: the session doc (single source
 * of truth for stage/round) and the participants collection (lobby map
 * markers + counts). Idempotent per sessionId.
 */
export function listenToSession(sessionId: string, userId: string): void {
	if (listeningSessionId === sessionId) return;
	stopListening();

	listeningSessionId = sessionId;
	state.loading = true;
	state.error = null;

	const sessionUnsub = onSnapshot(
		doc(db, Collections.agoraSessions, sessionId),
		(snapshot) => {
			if (!snapshot.exists()) {
				state.session = null;
				state.error = 'not-found';
				state.loading = false;
				m.redraw();

				return;
			}
			try {
				state.session = parse(AgoraSessionSchema, snapshot.data());
				applySessionTheme(state.session);
				state.loading = false;
			} catch (error) {
				console.error('[Session] Invalid session doc:', error);
				state.error = 'invalid';
				state.loading = false;
			}
			m.redraw();
		},
		(error) => {
			console.error('[Session] Session listener failed:', error);
			state.error = 'listener-failed';
			state.loading = false;
			m.redraw();
		},
	);

	const participantsUnsub = onSnapshot(
		query(collection(db, Collections.agoraParticipants), where('sessionId', '==', sessionId)),
		(snapshot) => {
			const participants: AgoraParticipant[] = [];
			snapshot.forEach((docSnap) => {
				try {
					const participant = parse(AgoraParticipantSchema, docSnap.data());
					// The characters' synthetic rater identities never appear as
					// classmates — not on the map, not in counts, not in gating
					if (participant.isAI) return;
					participants.push(participant);
				} catch (error) {
					console.error('[Session] Invalid participant doc:', error);
				}
			});
			participants.sort((a, b) => a.joinedAt - b.joinedAt);
			state.participants = participants;
			state.myParticipant =
				participants.find(
					(participant) =>
						participant.participantId === createAgoraParticipantId(sessionId, userId),
				) ?? null;
			state.participantsLoaded = true;
			m.redraw();
		},
		(error) => {
			console.error('[Session] Participants listener failed:', error);
			m.redraw();
		},
	);

	unsubscribers = [sessionUnsub, participantsUnsub];
}

// Last progress written, to keep view-driven reporting idempotent (no
// duplicate writes on redraws)
let lastProgressKey = '';

/**
 * Publish the student's self-paced scene progress onto their participant
 * doc — the teacher's "who finished, can I advance?" signal.
 */
export function reportStageProgress(
	sessionId: string,
	userId: string,
	stage: AgoraStage,
	scenesDone: number,
	scenesTotal: number,
): void {
	const key = `${sessionId}--${stage}--${scenesDone}/${scenesTotal}`;
	if (lastProgressKey === key) return;
	lastProgressKey = key;

	updateDoc(doc(db, Collections.agoraParticipants, createAgoraParticipantId(sessionId, userId)), {
		stageProgress: { stage, scenesDone, scenesTotal },
		lastActive: Date.now(),
	}).catch((error: unknown) => {
		// Progress is a courtesy signal — never block the student on it
		console.error('[Session] Report progress failed:', error);
		lastProgressKey = '';
	});
}

export function stopListening(): void {
	unsubscribers.forEach((unsubscribe) => unsubscribe());
	unsubscribers = [];
	listeningSessionId = null;
	state.session = null;
	state.participants = [];
	state.myParticipant = null;
	state.participantsLoaded = false;
	state.loading = false;
	state.error = null;
}
