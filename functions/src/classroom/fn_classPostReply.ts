import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	Role,
	StatementType,
	createStatementObject,
	functionConfig,
	lessonStatusOf,
} from '@freedi/shared-types';
import type {
	ClassPostReplyRequest,
	ClassPostReplyResponse,
	ClassReplyMarker,
	Creator,
	Statement,
	StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import { containsBadLanguage } from '../fn_profanityChecker';
import {
	isWorkspaceAdmin,
	loadMain,
	requireId,
	requireUid,
	subscriptionRef,
} from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonNotEnded, assertLessonRunning } from './lessonStatusGuard';
import {
	assertReplyTarget,
	cleanReplyText,
	decideReplyPush,
	replyRoleOf,
	unreadForAuthor,
} from './replyLogic';
import { loadReplyDevices, sendReplyPush } from './replyPush';
import type { ReplyDevice, ReplyPushSender } from './replyPush';

/**
 * `classPostReply` (IA 22): one reply under a proposal of the lesson, written
 * by the server so the AI language check cannot be skipped. A member of the
 * lesson (or its teacher) may reply to any visible proposal at any step: the
 * replies never close while the lesson exists. Students are refused while the
 * lesson is paused or ended (the room stands still); the teacher only once it
 * has ended. The teacher's words skip the language check.
 *
 * One transaction writes the reply and moves the proposal's `replyCount` /
 * `lastReplyAt`, and (when the push rules say so) stamps `replyPushAt` /
 * `replyPushCount`, so two replies in the same second cannot both buzz the
 * author. The push itself is sent after the commit and never fails the call.
 */

export interface PostReplyDeps {
	/** True when the text should be refused. Fails open (see containsBadLanguage). */
	detect: (text: string) => Promise<boolean>;
	send?: ReplyPushSender;
	now?: () => number;
}

function statementRef(firestore: Firestore, id: string) {
	return firestore.collection(Collections.statements).doc(id);
}

/** The replier as the reply's creator: the class name for a student, the account name for the teacher. */
function creatorOf(uid: string, sub: StatementSubscription | undefined, main: Statement): Creator {
	const fromSub = sub?.user;
	const teacher = main.creatorId === uid ? main.creator : undefined;

	return {
		uid,
		displayName: fromSub?.displayName?.trim() || teacher?.displayName || '',
		photoURL: null,
		isAnonymous: fromSub?.isAnonymous ?? teacher?.isAnonymous ?? true,
	};
}

async function loadMembership(
	firestore: Firestore,
	mainId: string,
	uid: string,
	main: Statement,
): Promise<{ teacher: boolean; sub: StatementSubscription | undefined }> {
	const snap = await subscriptionRef(firestore, mainId, uid).get();
	const sub = snap.exists ? (snap.data() as StatementSubscription) : undefined;
	const teacher = await isWorkspaceAdmin(firestore, mainId, uid, main);
	if (!teacher && (!sub || sub.role === Role.banned)) {
		throw new ClassroomError('permission-denied', 'Join the lesson first');
	}

	return { teacher, sub };
}

async function unreadCount(
	firestore: Firestore,
	mainId: string,
	proposalId: string,
	authorUid: string,
): Promise<number> {
	const [authorSub, replies] = await Promise.all([
		subscriptionRef(firestore, mainId, authorUid).get(),
		firestore.collection(Collections.statements).where('parentId', '==', proposalId).get(),
	]);
	const readAt = authorSub.exists
		? (authorSub.data() as StatementSubscription).proposalRepliesReadAt
		: undefined;
	const list = replies.docs
		.map((d) => d.data() as Statement)
		.filter((s) => s.classReply !== undefined);

	return Math.max(1, unreadForAuthor(list, authorUid, readAt));
}

export async function postReply(
	firestore: Firestore,
	actorUid: string,
	req: ClassPostReplyRequest,
	deps: PostReplyDeps,
): Promise<ClassPostReplyResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const proposalId = requireId(req?.proposalId, 'proposalId');
	const replyId = requireId(req?.replyId, 'replyId');
	const text = cleanReplyText(req?.text);
	const main = await loadMain(firestore, mainId);
	const { teacher, sub } = await loadMembership(firestore, mainId, actorUid, main);
	if (teacher) assertLessonNotEnded(main);
	else assertLessonRunning(main);

	const proposalSnap = await statementRef(firestore, proposalId).get();
	const proposal = proposalSnap.exists ? (proposalSnap.data() as Statement) : undefined;
	const questionSnap = proposal ? await statementRef(firestore, proposal.parentId).get() : null;
	const question = questionSnap?.exists ? (questionSnap.data() as Statement) : undefined;
	assertReplyTarget(proposal, question, mainId);

	if (!teacher && (await deps.detect(text))) return { ok: false, reason: 'language' };

	const authorUid = proposal.creatorId;
	const devices: ReplyDevice[] =
		authorUid !== actorUid ? await loadReplyDevices(firestore, authorUid) : [];
	const marker: ClassReplyMarker = {
		role: replyRoleOf(actorUid, teacher, proposal),
		proposalCreatorId: authorUid,
	};
	const built = createStatementObject({
		statementId: replyId,
		statement: text,
		statementType: StatementType.statement,
		parentId: proposalId,
		topParentId: proposal.topParentId || mainId,
		parents: [...(proposal.parents ?? []), proposalId],
		creatorId: actorUid,
		creator: creatorOf(actorUid, sub, main),
	});
	if (!built) throw new ClassroomError('internal', 'The reply could not be built');
	const now = (deps.now ?? Date.now)();

	const push = await firestore.runTransaction(async (tx) => {
		const replyRef = statementRef(firestore, replyId);
		const [existing, fresh] = await Promise.all([
			tx.get(replyRef),
			tx.get(statementRef(firestore, proposalId)),
		]);
		// A retry after a dropped answer: the reply is already there.
		if (existing.exists) return false;
		const current = (fresh.data() as Statement | undefined) ?? proposal;
		const decision = decideReplyPush({
			now,
			lessonStatus: lessonStatusOf(main.statementSettings?.lessonPlan),
			replierUid: actorUid,
			authorUid,
			hasDevice: devices.length > 0,
			lastPushAt: current.replyPushAt,
			pushCount: current.replyPushCount,
		});
		tx.set(replyRef, { ...built, createdAt: now, lastUpdate: now, classReply: marker });
		tx.update(statementRef(firestore, proposalId), {
			replyCount: (current.replyCount ?? 0) + 1,
			lastReplyAt: now,
			...(decision.send
				? { replyPushAt: now, replyPushCount: (current.replyPushCount ?? 0) + 1 }
				: {}),
		});

		return decision.send;
	});

	if (push) {
		await sendReplyPush(
			firestore,
			devices,
			{
				mainId,
				proposalId,
				lessonTitle: main.statement,
				count: await unreadCount(firestore, mainId, proposalId, authorUid),
			},
			deps.send,
		);
	}

	return { ok: true, replyId };
}

export const classPostReply = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassPostReplyRequest>): Promise<ClassPostReplyResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await postReply(db, uid, request.data, { detect: containsBadLanguage });
		} catch (error) {
			// Never the text: it is a child's words, and this is Cloud Logging.
			throw toHttpsError(error, {
				operation: 'classroom.classPostReply',
				userId: uid,
				statementId: request.data?.proposalId,
				metadata: { mainId: request.data?.mainId },
			});
		}
	},
);
