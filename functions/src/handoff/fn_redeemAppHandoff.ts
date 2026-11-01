import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { safeParse } from 'valibot';
import {
	AGORA_STATION_LINK,
	Access,
	AgoraLinkedAppSchema,
	AgoraSessionStatus,
	Collections,
	Role,
	createAgoraParticipantId,
	functionConfig,
	getStatementSubscriptionId,
	statementToSimpleStatement,
	type AgoraGuestClaim,
	type AgoraParticipant,
	type AgoraSession,
	type RedeemAppHandoffRequest,
	type RedeemAppHandoffResponse,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { generateAnonName } from '../agora/anonNames';
import { consumeAppHandoff, type AppHandoffRecord } from './appHandoff';

/** Accesses a signed-in guest reaches without a membership of their own */
const OPEN_ACCESS: ReadonlySet<Access> = new Set([Access.public, Access.openToAll, Access.open]);

/** Roles a guest already holds that need nothing added — or must not be touched */
const KEEP_ROLES: ReadonlySet<Role> = new Set([Role.admin, Role.creator, Role.member, Role.banned]);

/**
 * The name the guest wears in the other app: their Agora pseudonym — the
 * one their classmates already know — and, in a `named` session (where the
 * participant name is what they typed at the door), a fresh pseudonym
 * instead. Never a real name.
 */
export function guestDisplayName(
	session: Pick<AgoraSession, 'identity'>,
	participant: Pick<AgoraParticipant, 'anonName' | 'joinedAt'> | undefined,
): string {
	if (participant && session.identity !== 'named' && participant.anonName.trim()) {
		return participant.anonName.trim();
	}

	// The session stores no language of its own; Agora's classrooms are Hebrew
	return generateAnonName('he', participant?.joinedAt ?? Date.now());
}

/**
 * The statement whose membership governs the question: the question itself
 * when it overrides access, else its top parent (as `useAuthorization` reads it).
 */
async function governingStatement(question: Statement): Promise<Statement> {
	if (question.membership?.access || !question.topParentId || question.topParentId === 'top') {
		return question;
	}
	const top = await db.collection(Collections.statements).doc(question.topParentId).get();

	return top.exists ? (top.data() as Statement) : question;
}

/**
 * Let the guest in to a private question (Tal, 2026-10-20: yes): a member
 * subscription on the governing statement, unless access is open anyway or
 * the uid already holds a role there — an admin stays admin, a ban stays.
 */
export async function ensureGuestMembership(
	uid: string,
	displayName: string,
	statementId: string,
	now: number,
): Promise<void> {
	const snap = await db.collection(Collections.statements).doc(statementId).get();
	if (!snap.exists)
		throw new HttpsError('not-found', 'Question not found', { reason: 'not_found' });
	const governing = await governingStatement(snap.data() as Statement);
	const access = governing.membership?.access;
	if (access && OPEN_ACCESS.has(access)) return;

	const user = { uid, displayName, isAnonymous: true };
	const subscriptionId =
		getStatementSubscriptionId(governing.statementId, user) ?? `${uid}--${governing.statementId}`;
	const ref = db.collection(Collections.statementsSubscribe).doc(subscriptionId);
	const existing = await ref.get();
	const role = (existing.data() as Partial<StatementSubscription> | undefined)?.role;
	if (role && KEEP_ROLES.has(role)) return;

	const subscription: StatementSubscription = {
		role: Role.member,
		userId: uid,
		statementId: governing.statementId,
		statementsSubscribeId: subscriptionId,
		statement: statementToSimpleStatement(governing),
		user,
		lastUpdate: now,
		createdAt: now,
		parentId: governing.parentId,
		statementType: governing.statementType,
		topParentId: governing.topParentId,
		getInAppNotification: false,
		getEmailNotification: false,
		getPushNotification: false,
	};
	await ref.set(subscription);
}

/**
 * Turn a redeemed code into a sign-in for the same uid: the lesson must still
 * be running, the student still seated; the question gets them as a member
 * when it is private; the Auth name becomes their pseudonym; the token
 * carries `agora: {s, i, q}` — the claim that IS guest mode in the other app.
 */
export async function redeemForGuest(
	record: AppHandoffRecord,
	now: number,
): Promise<RedeemAppHandoffResponse> {
	const { uid, sessionId, itemId, statementId } = record;
	const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
	const session = sessionSnap.data() as AgoraSession | undefined;
	if (!session) throw new HttpsError('not-found', 'Session not found', { reason: 'ended' });
	if (session.status === AgoraSessionStatus.ended) {
		throw new HttpsError('failed-precondition', 'The lesson has ended', { reason: 'ended' });
	}
	const seat = await db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, uid))
		.get();
	if (!seat.exists) throw new HttpsError('permission-denied', 'Not in this lesson');
	const displayName = guestDisplayName(session, seat.data() as AgoraParticipant);

	await ensureGuestMembership(uid, displayName, statementId, now);
	const auth = getAuth();
	await auth.updateUser(uid, { displayName });
	const claim: AgoraGuestClaim = { s: sessionId, i: itemId, q: statementId };
	const token = await auth.createCustomToken(uid, { [AGORA_STATION_LINK.GUEST_CLAIM]: claim });

	return { token, displayName, sessionId, itemId, statementId };
}

export const redeemAppHandoff = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RedeemAppHandoffRequest>): Promise<RedeemAppHandoffResponse> => {
		const code = request.data?.code;
		const app = safeParse(AgoraLinkedAppSchema, request.data?.app);
		if (typeof code !== 'string' || !app.success) {
			throw new HttpsError('invalid-argument', 'Invalid handoff');
		}
		const now = Date.now();
		try {
			const record = await consumeAppHandoff(code, app.output, now);

			return await redeemForGuest(record, now);
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'handoff.redeemAppHandoff', metadata: { app: app.output } });
			throw new HttpsError('internal', 'Could not sign in');
		}
	},
);
