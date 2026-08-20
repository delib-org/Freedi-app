import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraTopicPackage,
	OdysseyGame,
	OdysseyIsland,
	Statement,
	functionConfig,
	resolveSessionFlow,
	scriptToFlow,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { buildCivicFramingScene } from './fn_agoraProvisionCivicSessions';

interface Request {
	gameId: string;
}

interface Result {
	/** Sessions whose flow now matches the game's script */
	updated: string[];
	/** Sessions left alone because they have already ended */
	skipped: string[];
}

/**
 * Re-point already-open deliberations at the game's current script.
 *
 * An organizer edits the script after opening the squares — that is the normal
 * case, not the exception, because the first thing anyone does with a new knob
 * is try it. Provisioning cannot help here: it treats the presence of a
 * session as "this island is done" and never touches it again.
 *
 * So the flow is patched in place rather than the session being closed and
 * reopened. Reopening would mint a new join code, orphan the proposals people
 * have already written and drop everyone out of a square they are standing in.
 * Clients pick the change up on their existing session snapshot; a round count
 * that changed mid-round settles at the next cycle boundary, because
 * `advanceCycle` is told the total each time it is called rather than
 * remembering one.
 *
 * Ended sessions are left as they are. Their score has been computed against
 * the rules they actually ran under, and rewriting the flow afterwards would
 * make the stored result unreadable.
 */
export const agoraUpdateCivicFlow = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { gameId } = request.data ?? {};
		if (!gameId || typeof gameId !== 'string') {
			throw new HttpsError('invalid-argument', 'gameId is required');
		}

		try {
			const gameSnap = await db.collection(Collections.odysseyGames).doc(gameId).get();
			if (!gameSnap.exists) {
				throw new HttpsError('not-found', 'Odyssey game not found');
			}
			const game = gameSnap.data() as OdysseyGame;

			const isAdmin = game.creatorId === uid || (game.adminUids ?? []).includes(uid);
			if (!isAdmin) {
				throw new HttpsError('permission-denied', 'Only game admins can change the script');
			}

			const open = Object.entries(game.agoraSessions ?? {});
			if (!open.length) {
				return { updated: [], skipped: [] };
			}

			const flow = scriptToFlow(game.script);
			const resolved = resolveSessionFlow({ sessionMode: AgoraSessionMode.civic, flow });
			const islandsById = new Map<string, OdysseyIsland>(
				game.islands.map((island) => [island.statementId, island]),
			);

			const sessionSnaps = await db.getAll(
				...open.map(([, entry]) => db.collection(Collections.agoraSessions).doc(entry.sessionId)),
			);

			const now = Date.now();
			const batch = db.batch();
			const updated: string[] = [];
			const skipped: string[] = [];

			for (const snap of sessionSnaps) {
				const session = snap.data() as AgoraSession | undefined;
				if (!session) continue;
				if (session.status === AgoraSessionStatus.ended) {
					skipped.push(session.sessionId);
					continue;
				}

				batch.update(snap.ref, {
					// A cleared script has to clear the stored flow too, or the
					// session would keep running knobs the organizer has removed.
					flow: flow ?? null,
					lastUpdate: now,
				});
				updated.push(session.sessionId);

				// Framing turned on after the fact has no scene to render, because
				// the package was built without one.
				if (!resolved.framing) continue;
				const island = session.civic
					? islandsById.get(session.civic.islandStatementId)
					: undefined;
				if (!island) continue;

				const topicRef = db.collection(Collections.agoraTopicPackages).doc(session.topicPackageId);
				const topicSnap = await topicRef.get();
				const topic = topicSnap.data() as AgoraTopicPackage | undefined;
				if (!topic || topic.scenes.length) continue;

				const questionSnap = await db
					.collection(Collections.statements)
					.doc(session.challengeQuestionId)
					.get();
				const questionText =
					(questionSnap.data() as Statement | undefined)?.statement || island.issue || island.title;

				batch.update(topicRef, {
					scenes: [buildCivicFramingScene(island, questionText)],
					lastUpdate: now,
				});
			}

			await batch.commit();

			return { updated, skipped };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.updateCivicFlow',
				userId: uid,
				metadata: { gameId },
			});
			throw new HttpsError('internal', 'Failed to update the event script');
		}
	},
);
