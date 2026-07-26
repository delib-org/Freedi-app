import {
	Collections,
	Evaluation,
	ODYSSEY_ATTITUDES,
	ODYSSEY_GAME_FIELD,
	OdysseyAttitudeKey,
	User as FreediUser,
} from '@freedi/shared-types';
import { collection, db, doc, getDocs, query, setDoc, where } from './firebase';

/**
 * Answering a stance IS a standard Freedi evaluation — same collection, same
 * `${uid}--${statementId}` doc id, same -1..1 scale — so the shared cloud
 * functions aggregate consensus/agreement on every stance automatically.
 * The only addition is `odysseyGameId`, mirroring Agora's `agoraSessionId`,
 * to scope queries per game.
 */

export function attitudeValue(key: OdysseyAttitudeKey): number {
	const entry = ODYSSEY_ATTITUDES.find((attitude) => attitude.key === key);
	if (!entry) throw new Error(`Unknown attitude: ${key}`);

	return entry.value;
}

export function valueToAttitude(value: number): OdysseyAttitudeKey | undefined {
	return ODYSSEY_ATTITUDES.find((attitude) => attitude.value === value)?.key;
}

export async function rateStance(params: {
	gameId: string;
	islandStatementId: string;
	stanceStatementId: string;
	attitude: OdysseyAttitudeKey;
	user: FreediUser;
}): Promise<void> {
	const { gameId, islandStatementId, stanceStatementId, attitude, user } = params;
	const evaluationId = `${user.uid}--${stanceStatementId}`;

	const evaluation: Evaluation & Record<string, unknown> = {
		evaluationId,
		parentId: islandStatementId,
		statementId: stanceStatementId,
		evaluatorId: user.uid,
		// The shared pipeline (statement.evaluation stats) requires an evaluator object.
		evaluator: user,
		evaluation: attitudeValue(attitude),
		updatedAt: Date.now(),
		[ODYSSEY_GAME_FIELD]: gameId,
	};

	await setDoc(doc(db, Collections.evaluations, evaluationId), evaluation);
}

/** All evaluations of this game — mine and everyone's (for distances). */
export async function loadGameEvaluations(gameId: string): Promise<Evaluation[]> {
	const snap = await getDocs(
		query(collection(db, Collections.evaluations), where(ODYSSEY_GAME_FIELD, '==', gameId)),
	);

	return snap.docs.map((d) => d.data() as Evaluation);
}

/** stance statementId → my evaluation value (-1..1) */
export function myAttitudes(evaluations: Evaluation[], uid: string): Record<string, number> {
	const mine: Record<string, number> = {};
	for (const evaluation of evaluations) {
		if (evaluation.evaluatorId === uid) {
			mine[evaluation.statementId] = evaluation.evaluation;
		}
	}

	return mine;
}
