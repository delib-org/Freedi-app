import m from 'mithril';
import { db, doc, collection, query, where, onSnapshot, updateDoc, Unsubscribe } from './firebase';
import {
	Collections,
	AgoraSession,
	AgoraParticipant,
	AgoraSessionSchema,
	AgoraParticipantSchema,
	AgoraStage,
	createAgoraParticipantId,
} from '@freedi/shared-types';
import { parse } from 'valibot';

export interface SessionState {
	session: AgoraSession | null;
	participants: AgoraParticipant[];
	myParticipant: AgoraParticipant | null;
	loading: boolean;
	error: string | null;
}

const state: SessionState = {
	session: null,
	participants: [],
	myParticipant: null,
	loading: false,
	error: null,
};

let unsubscribers: Unsubscribe[] = [];
let listeningSessionId: string | null = null;

export function getSessionState(): Readonly<SessionState> {
	return state;
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
	state.loading = false;
	state.error = null;
}
