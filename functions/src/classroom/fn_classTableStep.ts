import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	WritingModeSchema,
	allowOwnQuestionsOf,
	proposalsTurnsOf,
	speakSecondsOf,
	functionConfig,
} from '@freedi/shared-types';
import type {
	ClassTable,
	ClassTableAction,
	ClassTableStepRequest,
	ClassTableStepResponse,
	Statement,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { db } from '../db';
import {
	isSubQuestionOf,
	isWorkspaceAdmin,
	requireId,
	requireUid,
	tableRef,
} from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonRunning, lessonStepOf } from './lessonStatusGuard';
import { applyTableAction } from './tableTransitions';

/**
 * `classTableStep` (the table's asker, a tablemate where IA §2.4/§11.3 allow
 * it, or an admin): move one table. The pure state machine lives in
 * tableTransitions.ts; this wrapper validates the request, reads what the
 * machine cannot (admin role, the picked question) and writes the result in a
 * transaction so two taps never interleave.
 */

const MS_PER_SECOND = 1000;

/** Rebuild the action from the raw request: unknown keys never reach the machine. */
export function parseAction(req: ClassTableStepRequest): ClassTableAction {
	switch (req?.action) {
		case 'pickQuestion':
			return { action: 'pickQuestion', questionId: requireId(req.questionId, 'questionId') };
		case 'passAsker':
			return { action: 'passAsker', uid: requireId(req.uid, 'uid') };
		case 'passAsking':
			return typeof req.uid === 'string' && req.uid !== ''
				? { action: 'passAsking', uid: req.uid }
				: { action: 'passAsking' };
		case 'nextSpeaker':
			return { action: 'nextSpeaker', uid: requireId(req.uid, 'uid') };
		case 'setWritingMode': {
			const mode = safeParse(WritingModeSchema, req.mode);
			if (!mode.success) throw new ClassroomError('invalid-argument', 'mode must be each or table');

			return { action: 'setWritingMode', mode: mode.output };
		}
		case 'claimTurn': {
			if (typeof req.fromTurn !== 'number') {
				throw new ClassroomError(
					'invalid-argument',
					'A claim must name the turn it saw (fromTurn)',
				);
			}

			return {
				action: 'claimTurn',
				fromTurn: req.fromTurn,
				questionId: requireId(req.questionId, 'questionId'),
			};
		}
		case 'passSpeaking':
			return typeof req.uid === 'string' && req.uid !== ''
				? { action: 'passSpeaking', uid: req.uid }
				: { action: 'passSpeaking' };
		case 'toTalk':
		case 'toWrite':
		case 'toRate':
		case 'claimSpeaker':
		case 'finishSpeaking':
			return { action: req.action };
		case 'nextTurn':
			return typeof req.fromTurn === 'number'
				? { action: 'nextTurn', fromTurn: req.fromTurn }
				: { action: 'nextTurn' };
		case 'nextProposalsTurn':
			return typeof req.fromTurn === 'number'
				? { action: 'nextProposalsTurn', fromTurn: req.fromTurn }
				: { action: 'nextProposalsTurn' };
		default:
			throw new ClassroomError('invalid-argument', 'Unknown table action');
	}
}

export async function tableStep(
	firestore: Firestore,
	actorUid: string,
	req: ClassTableStepRequest,
	now: () => number = Date.now,
): Promise<ClassTableStepResponse> {
	const tableId = requireId(req?.tableId, 'tableId');
	const action = parseAction(req);
	const ref = tableRef(firestore, tableId);

	// Role and question checks read outside the transaction: neither changes
	// with the table's state, and a transaction only needs to guard the table.
	const first = await ref.get();
	if (!first.exists) throw new ClassroomError('not-found', 'Table not found');
	const { mainId } = first.data() as ClassTable;
	const isAdmin = await isWorkspaceAdmin(firestore, mainId, actorUid);
	let questionIsOwn = false;

	if (action.action === 'pickQuestion' || action.action === 'claimTurn') {
		const qSnap = await firestore.collection(Collections.statements).doc(action.questionId).get();
		const question = qSnap.exists ? (qSnap.data() as Statement) : undefined;
		const ownerTable = question?.classTable?.tableId;
		questionIsOwn = ownerTable !== undefined;
		if (
			!isSubQuestionOf(question, mainId) ||
			question?.statementSettings?.classRole === 'challenge' ||
			// A table's own question belongs to that table alone.
			(ownerTable !== undefined && ownerTable !== tableId)
		) {
			throw new ClassroomError('invalid-argument', "Pick one of this lesson's questions");
		}
	}

	const mainRef = firestore.collection(Collections.statements).doc(mainId);

	return firestore.runTransaction(async (tx) => {
		const [snap, mainSnap] = await Promise.all([tx.get(ref), tx.get(mainRef)]);
		if (!snap.exists) throw new ClassroomError('not-found', 'Table not found');
		// Read in the same transaction, so a pause landing between two taps is seen.
		const main = mainSnap.exists ? (mainSnap.data() as Statement) : null;
		assertLessonRunning(main);
		const next = applyTableAction(snap.data() as ClassTable, action, {
			lessonStep: lessonStepOf(main),
			actorUid,
			isAdmin,
			now: now(),
			questionIsOwn,
			allowOwnQuestions: allowOwnQuestionsOf(main),
			speakMs: speakSecondsOf(main) * MS_PER_SECOND,
			proposalsTurns: proposalsTurnsOf(main),
		});
		tx.set(ref, next);

		return { step: next.step, turn: next.turn };
	});
}

export const classTableStep = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassTableStepRequest>): Promise<ClassTableStepResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await tableStep(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classTableStep',
				userId: uid,
				metadata: { tableId: request.data?.tableId, action: request.data?.action },
			});
		}
	},
);
