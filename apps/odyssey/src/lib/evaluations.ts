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

/**
 * The least the sea needs to know about a sailor.
 *
 * `evaluations` are readable by any signed-in user — Odyssey's own opinion map
 * and fellow-sailor list are built by loading the whole game's evaluations in
 * the browser, and firestore.rules says so out loud. Writing the full account
 * object onto every rating therefore published each player's Google email and
 * full name next to their answer on every political question they touched, to
 * every other player, through the app's own loader. Nothing ever read those
 * fields: the fellow-sailor list has always shown `displayName.split(' ')[0]`.
 *
 * So only the first name is stored, and the email and photo are not stored at
 * all. Ratings written before this still carry them — see
 * `scripts/strip-evaluator-emails.ts`.
 */
export function voyageIdentity(user: FreediUser): FreediUser {
	return {
		uid: user.uid,
		displayName: (user.displayName ?? '').trim().split(/\s+/)[0] || 'מפליג/ה',
		isAnonymous: user.isAnonymous,
	};
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
		// The shared pipeline (statement.evaluation stats) requires an evaluator
		// object — but not this much of one. See voyageIdentity().
		evaluator: voyageIdentity(user),
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
