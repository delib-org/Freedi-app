import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { safeParse } from 'valibot';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AgoraStagePlan,
	AgoraStagePlanSchema,
	AgoraTopicPackage,
	functionConfig,
	currentPlanIndex,
	resolveStagePlan,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { buildQuestionStatement } from './questionStage';
import { sanitizeStagePlan } from './stagePlanInput';

interface Request {
	sessionId: string;
	/** The whole plan; only the items after the current one may differ */
	stagePlan: AgoraStagePlan;
}

interface Result {
	ok: boolean;
	stagePlan: AgoraStagePlan;
}

/**
 * The teacher edits the stages still ahead of the room — adds a question
 * after seeing where the conversation went, drops a vote nobody needs.
 *
 * Items up to and including the current one are frozen: their outcomes are
 * computed, their answers written. The comparison and the write share one
 * transaction with the `stageIndex` read, so an advance landing at the same
 * moment cannot let the teacher rewrite the item that just opened.
 */
export const agoraUpdateStagePlan = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { sessionId, stagePlan } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		const parsed = safeParse(AgoraStagePlanSchema, stagePlan);
		if (!parsed.success) {
			throw new HttpsError('invalid-argument', 'Invalid stage plan');
		}

		try {
			const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
			const token = request.auth?.token as Record<string, unknown> | undefined;
			const creator = {
				uid,
				displayName: typeof token?.name === 'string' ? token.name : 'Teacher',
				email: typeof token?.email === 'string' ? token.email : null,
				photoURL: typeof token?.picture === 'string' ? token.picture : null,
				isAnonymous: false,
			};

			const saved = await db.runTransaction(async (transaction) => {
				const snap = await transaction.get(sessionRef);
				if (!snap.exists) throw new HttpsError('not-found', 'Session not found');
				const session = snap.data() as AgoraSession;
				if (session.teacherId !== uid) {
					throw new HttpsError('permission-denied', 'Only the session teacher can edit the plan');
				}
				if (session.status === AgoraSessionStatus.ended) {
					throw new HttpsError('failed-precondition', 'The session has ended');
				}

				const topicSnap = await transaction.get(
					db.collection(Collections.agoraTopicPackages).doc(session.topicPackageId),
				);
				const topic = topicSnap.data() as AgoraTopicPackage | undefined;
				const hasCharacters = topic?.kind !== 'quick';

				const clean = sanitizeStagePlan(parsed.output, { hasCharacters });

				// The frozen prefix must be byte-for-byte what is stored (ended is
				// appended at resolve time, so compare against the resolved plan
				// minus that terminal item).
				const current = resolveStagePlan(session).filter((item) => item.stage !== AgoraStage.ended);
				const frozenUpTo = currentPlanIndex(session);
				for (let index = 0; index <= frozenUpTo && index < current.length; index += 1) {
					const stored = current[index];
					const incoming = clean[index];
					if (!incoming || incoming.itemId !== stored.itemId || incoming.stage !== stored.stage) {
						throw new HttpsError('failed-precondition', 'Stages already opened cannot be changed');
					}
					// Keep the stored item exactly — statementId, outcome inputs and all
					clean[index] = stored;
				}

				// New question items get their Statement now; edited ones get their
				// text updated. Both are safe inside the transaction: the ids are
				// deterministic per item and the writes touch only this session's tree.
				const existingById = new Map(current.map((item) => [item.itemId, item]));
				for (let index = frozenUpTo + 1; index < clean.length; index += 1) {
					const item = clean[index];
					if (item.stage !== AgoraStage.question) continue;
					const previous = existingById.get(item.itemId);
					if (previous?.statementId) {
						clean[index] = { ...item, statementId: previous.statementId };
						transaction.update(db.collection(Collections.statements).doc(previous.statementId), {
							statement: (item.title ?? '').trim(),
							description: (item.explanation ?? '').trim(),
							lastUpdate: Date.now(),
						});
						continue;
					}
					const statement = buildQuestionStatement({
						item,
						sessionId,
						rootStatementId: session.rootStatementId,
						creatorId: uid,
						creator,
					});
					if (!statement) throw new HttpsError('internal', 'Failed to build question');
					transaction.set(
						db.collection(Collections.statements).doc(statement.statementId),
						statement,
					);
					clean[index] = { ...item, statementId: statement.statementId };
				}

				transaction.update(sessionRef, { stagePlan: clean, lastUpdate: Date.now() });

				return clean;
			});

			return { ok: true, stagePlan: saved };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.updateStagePlan',
				userId: uid,
				metadata: { sessionId },
			});
			throw new HttpsError('internal', 'Failed to update the stage plan');
		}
	},
);
