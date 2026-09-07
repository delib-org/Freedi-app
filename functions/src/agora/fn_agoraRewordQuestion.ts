import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AgoraStagePlanItem,
	AgoraTeacherPrompts,
	AGORA_STAGE_PLAN,
	currentPlanIndex,
	functionConfig,
	questionKindOf,
	resolveStagePlan,
	RewordQuestionRequest,
	RewordQuestionResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * The teacher makes the question in front of the room clearer — while the
 * room is looking at it.
 *
 * `agoraUpdateStagePlan` freezes every item up to and including the current
 * one, because an opened item's answers and outcome are computed against it.
 * The WORDS are the exception this function exists for: they change nothing
 * that has been counted, and a class that does not understand the question
 * needs them fixed now. So only `title` and `explanation` move here, on ONE
 * named item (plus, at the teacher's word, its siblings of the same round
 * kind) — never the order, the kinds, the selection or the statement ids.
 *
 * `scope: 'kind'` also files the wording as this teacher's standing wording
 * for that round (`agoraTeacherPrompts/{uid}`), which `applyTeacherPrompts`
 * stamps onto the plans they start afterwards. An `open` question has no
 * shared prompt to file, so it is refused.
 */
export const agoraRewordQuestion = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RewordQuestionRequest>): Promise<RewordQuestionResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { sessionId, itemId, title, explanation, scope } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (!itemId || typeof itemId !== 'string') {
			throw new HttpsError('invalid-argument', 'itemId is required');
		}
		if (typeof title !== 'string' || typeof explanation !== 'string') {
			throw new HttpsError('invalid-argument', 'title and explanation must be strings');
		}
		if (scope !== 'session' && scope !== 'kind') {
			throw new HttpsError('invalid-argument', 'scope must be session or kind');
		}

		const cleanTitle = title.trim().slice(0, AGORA_STAGE_PLAN.MAX_TITLE_LENGTH);
		const cleanExplanation = explanation.trim().slice(0, AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH);

		try {
			const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
			const now = Date.now();

			const outcome = await db.runTransaction(async (transaction) => {
				const snap = await transaction.get(sessionRef);
				if (!snap.exists) throw new HttpsError('not-found', 'Session not found');
				const session = snap.data() as AgoraSession;
				if (session.teacherId !== uid) {
					throw new HttpsError(
						'permission-denied',
						'Only the session teacher can reword a question',
					);
				}
				if (session.status === AgoraSessionStatus.ended) {
					throw new HttpsError('failed-precondition', 'The session has ended');
				}
				// A question item only ever exists inside an explicit plan — the
				// legacy order has none, so there is nothing here to reword.
				const stored = session.stagePlan;
				if (!stored || stored.length === 0) {
					throw new HttpsError('failed-precondition', 'This game has no stage plan');
				}

				const plan = resolveStagePlan(session);
				const target = plan.find((item) => item.itemId === itemId);
				if (!target || target.stage !== AgoraStage.question) {
					throw new HttpsError('not-found', 'No question stage with that id');
				}

				const kind = questionKindOf(target);
				// An open question is nothing without its words, and it has no
				// siblings: "all rounds like this one" is a round's question.
				if (kind === 'open') {
					if (!cleanTitle) {
						throw new HttpsError('invalid-argument', 'An open question needs a title');
					}
					if (scope === 'kind') {
						throw new HttpsError(
							'failed-precondition',
							'Only a round can be reworded for every game',
						);
					}
				}

				// A round that has already CLOSED keeps the words it was answered
				// under: its outcome and its AI record were written against them,
				// and rewriting them would make the recap describe a question the
				// class was never asked. The named item is always reworded — the
				// teacher pointed at it — but the sweep over its siblings stops at
				// the room's own position.
				const here = currentPlanIndex(session);
				const rewords = (item: AgoraStagePlanItem, index: number): boolean => {
					if (item.stage !== AgoraStage.question) return false;
					if (item.itemId === itemId) return true;

					return scope === 'kind' && questionKindOf(item) === kind && index >= here;
				};

				const touched: string[] = [];
				const next = stored.map((item, index) => {
					if (!rewords(item, index)) return item;
					touched.push(item.itemId);
					const reworded: AgoraStagePlanItem = { ...item, title: cleanTitle };
					if (cleanExplanation) {
						reworded.explanation = cleanExplanation;
					} else {
						delete reworded.explanation;
					}
					if (item.statementId) {
						// The question Statement carries the same words — it is what the
						// answers hang off, and what every recap of this stage reads.
						transaction.update(db.collection(Collections.statements).doc(item.statementId), {
							statement: cleanTitle || kind,
							description: cleanExplanation,
							lastUpdate: now,
						});
					}

					return reworded;
				});

				transaction.update(sessionRef, { stagePlan: next, lastUpdate: now });

				const savedAsDefault = scope === 'kind' && kind !== 'open';
				if (savedAsDefault) {
					const promptsRef = db.collection(Collections.agoraTeacherPrompts).doc(uid);
					const prompts: AgoraTeacherPrompts = {
						teacherId: uid,
						prompts: {
							[kind]: { title: cleanTitle, explanation: cleanExplanation, updatedAt: now },
						},
						lastUpdate: now,
					};
					transaction.set(promptsRef, prompts, { merge: true });
				}

				return { itemIds: touched, savedAsDefault };
			});

			return { ok: true, ...outcome };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.rewordQuestion',
				userId: uid,
				metadata: { sessionId, itemId, scope },
			});
			throw new HttpsError('internal', 'Failed to reword the question');
		}
	},
);
