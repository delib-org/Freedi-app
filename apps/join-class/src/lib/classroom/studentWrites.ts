import {
	CLASS_SIDES_COLLECTION,
	Collections,
	NO_VOTE,
	Role,
	SIDE_MAX,
	SIDE_MIN,
	SUPPORT_MAX,
	SUPPORT_MIN,
	Statement,
	StatementSubscription,
	Vote,
	campOf,
	classSideId,
	getStatementSubscriptionId,
	getVoteId,
} from '@freedi/shared-types';
import type { ClassSide } from '@freedi/shared-types';
import { db, doc, getDoc, setDoc, updateDoc, writeBatch } from '../firebase';
import { getCustomDisplayName, getMainStatement } from '../store';
import { getUserState } from '../user';
import { resolveSubscriptionName } from './subscriptionName';

/**
 * What a student device writes in the classroom (all on its own docs).
 *
 * Side doc: `classSides/{uid}--{mainId}` (own doc, owner-only read and write,
 * Trello btMVQMM5): side (0..100), camp ('a'|'center'|'b'), decisionSupport
 * (-1..+1). The teacher may learn THAT a student chose, never WHICH, so the side
 * never goes on the subscription (any signed-in user can read that).
 *
 * Subscription doc: `statementsSubscribe/{uid}--{mainId}` (own doc). The first
 * pick also sets `sidePickedAt` there, in the same batch as the side doc (the
 * rules accept the flag only when that batch leaves a camp on the side doc).
 * `tableId` is server-written, never here.
 *
 * Vote doc (same as the main app's setVoteToDB): `votes/{uid}--{challengeId}`
 *   { voteId, statementId: <optionId> | 'none', parentId: <challengeId>,
 *     userId: <uid>, lastUpdate, createdAt }
 * The existing fn_vote trigger tallies it into `selections{}` on the challenge
 * question. Un-vote / blank = statementId 'none' (NO_VOTE). `voter` is omitted
 * (optional in VoteSchema; Join keeps no User object).
 */

function requireUid(op: string): string {
	const uid = getUserState().user?.uid;
	if (!uid) throw new Error(`[Classroom] ${op}: no signed-in user`);

	return uid;
}

function subscriptionId(mainId: string, uid: string): string {
	return (
		getStatementSubscriptionId(mainId, { uid } as Parameters<
			typeof getStatementSubscriptionId
		>[1]) ?? `${uid}--${mainId}`
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Make sure the student has a member subscription on the workspace (so the
 * roster and the engine can see them, and the side doc's rule finds it).
 * Returns it (as stored, or as just created). Needs the main statement in the store (MainHub /
 * StudentStage load it first); pass it when you already hold it.
 */
export async function ensureMemberSubscription(
	mainId: string,
	main: Statement | undefined = getMainStatement() ?? undefined,
): Promise<StatementSubscription> {
	try {
		const user = getUserState().user;
		const uid = requireUid('ensureMemberSubscription');
		const subId = subscriptionId(mainId, uid);
		const ref = doc(db, Collections.statementsSubscribe, subId);
		const name = resolveSubscriptionName(user, getCustomDisplayName());
		const existing = await getDoc(ref);
		if (existing.exists()) {
			const current = existing.data() as StatementSubscription;
			// A sub made before the name was known (or by another app) shows as "someone" at the table.
			const stored = current.user?.displayName?.trim();
			if (name && !stored) {
				await updateDoc(ref, { 'user.displayName': name, lastUpdate: Date.now() });
			}

			return current;
		}
		if (!main || main.statementId !== mainId) {
			throw new Error('main statement not loaded');
		}
		const now = Date.now();
		const sub: StatementSubscription = {
			statementsSubscribeId: subId,
			userId: uid,
			statementId: mainId,
			statement: main,
			user: {
				uid,
				displayName: name,
				photoURL: null,
				isAnonymous: user?.isAnonymous ?? true,
			},
			role: Role.member,
			parentId: main.parentId,
			statementType: main.statementType,
			topParentId: main.topParentId || main.parentId,
			lastUpdate: now,
			createdAt: now,
		};
		await setDoc(ref, sub, { merge: true });

		return sub;
	} catch (error) {
		console.error('[Classroom] ensureMemberSubscription failed:', error);
		throw error;
	}
}

function sideRef(mainId: string, uid: string) {
	return doc(db, CLASS_SIDES_COLLECTION, classSideId(mainId, uid));
}

/**
 * Write the slider value (clamped to 0..100) and its camp on the private side
 * doc; on the first pick, flag the subscription in the same batch.
 */
export async function setMySide(mainId: string, side: number): Promise<void> {
	try {
		const uid = requireUid('setMySide');
		const sub = await ensureMemberSubscription(mainId);
		const value = clamp(Math.round(side), SIDE_MIN, SIDE_MAX);
		const now = Date.now();
		const mine: ClassSide = {
			userId: uid,
			mainId,
			side: value,
			camp: campOf(value),
			lastUpdate: now,
		};
		const batch = writeBatch(db);
		batch.set(sideRef(mainId, uid), mine, { merge: true });
		if (typeof sub.sidePickedAt !== 'number') {
			batch.update(doc(db, Collections.statementsSubscribe, subscriptionId(mainId, uid)), {
				sidePickedAt: now,
			});
		}
		await batch.commit();
	} catch (error) {
		console.error('[Classroom] setMySide failed:', error);
		throw error;
	}
}

/** Write the support for the decision, -1..+1 (clamped), on the private side doc. */
export async function setMyDecisionSupport(mainId: string, value: number): Promise<void> {
	try {
		const uid = requireUid('setMyDecisionSupport');
		await ensureMemberSubscription(mainId);
		await setDoc(
			sideRef(mainId, uid),
			{
				userId: uid,
				mainId,
				decisionSupport: clamp(value, SUPPORT_MIN, SUPPORT_MAX),
				lastUpdate: Date.now(),
			},
			{ merge: true },
		);
	} catch (error) {
		console.error('[Classroom] setMyDecisionSupport failed:', error);
		throw error;
	}
}

/** Cast (or change) the ballot vote; pass 'none' to withdraw. createdAt is kept on change. */
export async function castVote(
	mainId: string,
	challengeId: string,
	optionId: string | typeof NO_VOTE,
): Promise<void> {
	try {
		const uid = requireUid('castVote');
		const voteId = getVoteId(uid, challengeId);
		const ref = doc(db, Collections.votes, voteId);
		const existing = await getDoc(ref);
		const now = Date.now();
		const createdAt = existing.exists() ? ((existing.data() as Vote).createdAt ?? now) : now;
		const vote: Vote = {
			voteId,
			statementId: optionId,
			parentId: challengeId,
			userId: uid,
			lastUpdate: now,
			createdAt,
		};
		await setDoc(ref, vote, { merge: true });
		void mainId; // kept in the signature: the workspace the vote belongs to (rules may scope by it later)
	} catch (error) {
		console.error('[Classroom] castVote failed:', error);
		throw error;
	}
}
