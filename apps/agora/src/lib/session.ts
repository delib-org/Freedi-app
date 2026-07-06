import m from 'mithril';
import { db, doc, collection, query, where, onSnapshot, Unsubscribe } from './firebase';
import {
	Collections,
	AgoraSession,
	AgoraParticipant,
	AgoraSessionSchema,
	AgoraParticipantSchema,
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
					participants.push(parse(AgoraParticipantSchema, docSnap.data()));
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
