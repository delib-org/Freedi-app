/**
 * The lottery that deals a student their hand of classmates' notes.
 *
 * Reads are all class-sized (a session holds tens of notes and tens of
 * students): the notes under the parent, the student's ratings, and every
 * hand in the session — the hands are where "how many have read this note"
 * comes from. The choice itself is `planDeal` in shared-types; this module
 * only gathers its input and appends the result to the hand doc.
 *
 * Returns a typed result and never throws an HttpsError, like `advanceSession`.
 */

import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraHand,
	AgoraParticipant,
	AgoraSession,
	AgoraSessionStatus,
	DealCandidate,
	DealNotesMode,
	DealNotesResponse,
	Evaluation,
	ModeratedDoc,
	Statement,
	StatementType,
	createAgoraHandId,
	createAgoraParticipantId,
	isAgoraHidden,
	lotteryActive,
	planDeal,
	resolveStagePlan,
} from '@freedi/shared-types';

export interface DealNotesInput {
	sessionId: string;
	parentId: string;
	mode: DealNotesMode;
	uid: string;
}

export type DealNotesResult =
	| { ok: true; value: DealNotesResponse }
	| { ok: false; reason: 'not-found' | 'forbidden' | 'ended' | 'invalid-parent' };

export interface CandidateInput {
	/** Every note under the parent, hidden ones included */
	pool: readonly Pick<Statement, 'statementId' | 'creatorId' | 'hide'>[];
	uid: string;
	hand: readonly string[];
	rated: ReadonlySet<string>;
	/** Every hand in the session for this parent, the student's own included */
	hands: readonly (readonly string[])[];
	hidden?: (statementId: string) => boolean;
}

/** Notes the student may still be dealt, each with how many hands already hold it */
export function buildCandidates(input: CandidateInput): DealCandidate[] {
	const dealtCount = new Map<string, number>();
	for (const hand of input.hands) {
		for (const statementId of hand) {
			dealtCount.set(statementId, (dealtCount.get(statementId) ?? 0) + 1);
		}
	}
	const held = new Set(input.hand);

	return input.pool
		.filter(
			(note) =>
				note.creatorId !== input.uid &&
				!held.has(note.statementId) &&
				!input.rated.has(note.statementId) &&
				note.hide !== true &&
				!input.hidden?.(note.statementId),
		)
		.map((note) => ({
			statementId: note.statementId,
			dealtCount: dealtCount.get(note.statementId) ?? 0,
		}));
}

/** The parents a session deals from: the challenge question and every planned question */
export function dealableParents(session: AgoraSession): Set<string> {
	const parents = new Set<string>([session.challengeQuestionId]);
	for (const item of resolveStagePlan(session)) {
		if (item.statementId) parents.add(item.statementId);
	}

	return parents;
}

export async function dealNotes(input: DealNotesInput): Promise<DealNotesResult> {
	const { sessionId, parentId, mode, uid } = input;

	const [sessionSnap, participantSnap] = await Promise.all([
		db.collection(Collections.agoraSessions).doc(sessionId).get(),
		db
			.collection(Collections.agoraParticipants)
			.doc(createAgoraParticipantId(sessionId, uid))
			.get(),
	]);
	if (!sessionSnap.exists) return { ok: false, reason: 'not-found' };
	const session = sessionSnap.data() as AgoraSession;
	const participant = participantSnap.data() as AgoraParticipant | undefined;
	if (!participant || participant.isAI || uid === session.teacherId) {
		return { ok: false, reason: 'forbidden' };
	}
	if (session.status === AgoraSessionStatus.ended) return { ok: false, reason: 'ended' };
	if (!dealableParents(session).has(parentId)) return { ok: false, reason: 'invalid-parent' };

	const [participantsSnap, poolSnap, ratingsSnap, handsSnap] = await Promise.all([
		db.collection(Collections.agoraParticipants).where('sessionId', '==', sessionId).get(),
		db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.get(),
		db
			.collection(Collections.evaluations)
			.where('agoraSessionId', '==', sessionId)
			.where('evaluatorId', '==', uid)
			.get(),
		db.collection(Collections.agoraHands).where('sessionId', '==', sessionId).get(),
	]);

	const students = participantsSnap.docs
		.map((doc) => doc.data() as AgoraParticipant)
		.filter((row) => !row.isAI && row.userId !== session.teacherId).length;

	const handDocs = handsSnap.docs.map((doc) => doc.data() as AgoraHand);
	const mine = handDocs.find((row) => row.userId === uid)?.hands[parentId] ?? [];

	if (!lotteryActive(students)) {
		return { ok: true, value: { active: false, hand: mine, dealt: [], poolExhausted: true } };
	}

	const pool = poolSnap.docs
		.map((doc) => doc.data() as Statement)
		.filter((note) => note.agoraSessionId === sessionId);
	const hiddenIds = new Set(
		pool.filter((note) => isAgoraHidden(note as ModeratedDoc)).map((note) => note.statementId),
	);
	const rated = new Set(
		ratingsSnap.docs
			.map((doc) => doc.data() as Evaluation)
			.filter((row) => row.parentId === parentId)
			.map((row) => row.statementId),
	);

	const plan = planDeal({
		mode,
		hand: mine,
		rated,
		candidates: buildCandidates({
			pool,
			uid,
			hand: mine,
			rated,
			hands: handDocs.map((row) => row.hands[parentId] ?? []),
			hidden: (statementId) => hiddenIds.has(statementId),
		}),
	});

	if (plan.dealt.length === 0) {
		return {
			ok: true,
			value: { active: true, hand: mine, dealt: [], poolExhausted: plan.poolExhausted },
		};
	}

	const handRef = db.collection(Collections.agoraHands).doc(createAgoraHandId(sessionId, uid));
	const hand = await db.runTransaction(async (tx) => {
		const snap = await tx.get(handRef);
		const existing = (snap.data() as AgoraHand | undefined)?.hands[parentId] ?? [];
		const known = new Set(existing);
		const added = plan.dealt.filter((statementId) => !known.has(statementId));
		const lastUpdate = Date.now();
		if (!snap.exists) {
			const doc: AgoraHand = {
				sessionId,
				userId: uid,
				hands: { [parentId]: [...existing, ...added] },
				lastUpdate,
			};
			tx.set(handRef, doc);
		} else if (added.length > 0) {
			tx.update(
				handRef,
				new FieldPath('hands', parentId),
				FieldValue.arrayUnion(...added),
				'lastUpdate',
				lastUpdate,
			);
		}

		return [...existing, ...added];
	});

	return {
		ok: true,
		value: { active: true, hand, dealt: plan.dealt, poolExhausted: plan.poolExhausted },
	};
}
