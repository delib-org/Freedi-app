import m from 'mithril';
import { db, doc, onSnapshot, functions, httpsCallable, Unsubscribe } from './firebase';
import {
	Collections,
	AgoraValueAnswer,
	AgoraValueAnswerSchema,
	createAgoraValueAnswerId,
} from '@freedi/shared-types';
import { parse } from 'valibot';

export interface ValueAnswersState {
	/** characterId → answer (with grading fields once the AI lands) */
	answers: Record<string, AgoraValueAnswer>;
	/** characterId → a submission is in flight / awaiting grade */
	pending: Record<string, boolean>;
}

const state: ValueAnswersState = { answers: {}, pending: {} };
let unsubscribers: Unsubscribe[] = [];
let listeningKey = '';

export function getValueAnswersState(): Readonly<ValueAnswersState> {
	return state;
}

/** Listen to this student's answer docs for all characters of the topic */
export function listenToValueAnswers(
	sessionId: string,
	userId: string,
	characterIds: string[],
): void {
	const key = `${sessionId}--${userId}`;
	if (listeningKey === key) return;
	stopValueAnswerListeners();
	listeningKey = key;

	unsubscribers = characterIds.map((characterId) =>
		onSnapshot(
			doc(
				db,
				Collections.agoraValueAnswers,
				createAgoraValueAnswerId(sessionId, userId, characterId),
			),
			(snapshot) => {
				if (snapshot.exists()) {
					try {
						const answer = parse(AgoraValueAnswerSchema, snapshot.data());
						state.answers[characterId] = answer;
						if (answer.gradedAt) state.pending[characterId] = false;
					} catch (error) {
						console.error('[Values] Invalid answer doc:', error);
					}
				}
				m.redraw();
			},
			(error) => {
				console.error('[Values] Answer listener failed:', error);
			},
		),
	);
}

export function stopValueAnswerListeners(): void {
	unsubscribers.forEach((unsubscribe) => unsubscribe());
	unsubscribers = [];
	listeningKey = '';
	state.answers = {};
	state.pending = {};
}

/**
 * Fire-and-forget submission: the callable grades server-side and the
 * answer-doc listener delivers the feedback asynchronously.
 */
export function submitValueAnswer(
	sessionId: string,
	characterId: string,
	answerText: string,
): void {
	state.pending[characterId] = true;
	const call = httpsCallable<
		{ sessionId: string; characterId: string; answerText: string },
		{ answerId: string }
	>(functions, 'agoraGradeValueIdentification');
	call({ sessionId, characterId, answerText }).catch((error: unknown) => {
		console.error('[Values] Submission failed:', error);
		state.pending[characterId] = false;
		m.redraw();
	});
	m.redraw();
}
