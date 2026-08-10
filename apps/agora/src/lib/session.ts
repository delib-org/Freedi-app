import m from 'mithril';
import { db, doc, collection, query, where, onSnapshot, updateDoc, Unsubscribe } from './firebase';
import {
	Collections,
	AgoraSession,
	AgoraParticipant,
	AgoraSessionSchema,
	AgoraParticipantSchema,
	AgoraStage,
	AgoraCamp,
	createAgoraParticipantId,
} from '@freedi/shared-types';
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
 * Positioned students per camp — the finite population the class consensus
 * divides by. AI raters are already dropped at ingestion, so this is the class
 * and nothing else.
 *
 * The client needs this so the results tab moves the instant a classmate rates,
 * instead of waiting for the trigger to write the score back. It feeds the same
 * shared calcAgoraClassConsensus the server uses, so the live number and the
 * stored one cannot disagree on anything but freshness.
 */
export function getCampCensus(): { left: number; right: number; center: number } {
	const census = { left: 0, right: 0, center: 0 };
	for (const participant of state.participants) {
		if (participant.camp === AgoraCamp.left) census.left++;
		else if (participant.camp === AgoraCamp.right) census.right++;
		else if (participant.camp === AgoraCamp.center) census.center++;
	}

	return census;
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
