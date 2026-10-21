import m from 'mithril';
import { Collections, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { db, doc, collection, query, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { resilientOnSnapshot } from '../resilientListeners';
import { getChallengeQuestion } from '../lessonCore';

/**
 * Live data of the projector that `watchClass` does not carry: the workspace
 * (for the step index and the class code), its questions (for the challenge
 * question's selections / ballot / roundPhase) and the challenge question's
 * options (the proposals). Tables and roster come from `watchClass(.., 'teacher')`.
 * Same store pattern as classState.ts: module state + `m.redraw()` on delivery.
 */

export interface ProjectorData {
	main: Statement | null;
	questions: Statement[];
	challenge: Statement | null;
	/** Options of the challenge question (proposals). */
	proposals: Statement[];
}

export const projectorData: ProjectorData = {
	main: null,
	questions: [],
	challenge: null,
	proposals: [],
};

const LISTENER_MAIN = 'projectorMain';
const LISTENER_QUESTIONS = 'projectorQuestions';
const LISTENER_PROPOSALS = 'projectorProposals';

function reset(): void {
	projectorData.main = null;
	projectorData.questions = [];
	projectorData.challenge = null;
	projectorData.proposals = [];
}

/** Start the projector listeners; returns the stop function. */
export function watchProjector(mainId: string): () => void {
	reset();
	let proposalsStop: Unsubscribe | null = null;
	let proposalsFor: string | null = null;
	let stopped = false;

	const onError = (label: string) => (error: Error) => {
		console.error(`[Projector] ${label} listener error:`, error);
	};

	const watchProposals = (challengeId: string | null): void => {
		if (challengeId === proposalsFor) return;
		proposalsFor = challengeId;
		proposalsStop?.();
		proposalsStop = null;
		projectorData.proposals = [];
		if (!challengeId || stopped) return;
		proposalsStop = resilientOnSnapshot(
			LISTENER_PROPOSALS,
			query(
				collection(db, Collections.statements),
				where('parentId', '==', challengeId),
				where('statementType', '==', StatementType.option),
			),
			(snap) => {
				projectorData.proposals = snap.docs.map((d) => d.data() as Statement);
				m.redraw();
			},
			onError('proposals'),
		);
	};

	const mainStop = resilientOnSnapshot(
		LISTENER_MAIN,
		doc(db, Collections.statements, mainId),
		(snap) => {
			projectorData.main = snap.exists() ? (snap.data() as Statement) : null;
			m.redraw();
		},
		onError('main'),
	);

	const questionsStop = resilientOnSnapshot(
		LISTENER_QUESTIONS,
		query(
			collection(db, Collections.statements),
			where('parentId', '==', mainId),
			where('statementType', '==', StatementType.question),
		),
		(snap) => {
			projectorData.questions = snap.docs.map((d) => d.data() as Statement);
			projectorData.challenge = getChallengeQuestion(projectorData.questions);
			watchProposals(projectorData.challenge?.statementId ?? null);
			m.redraw();
		},
		onError('questions'),
	);

	return () => {
		stopped = true;
		mainStop();
		questionsStop();
		proposalsStop?.();
		reset();
	};
}
