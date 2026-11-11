import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_PROPOSAL_MAX_LENGTH,
	Collections,
	StatementType,
	createStatementObject,
	functionConfig,
	proposalLimitOf,
} from '@freedi/shared-types';
import type {
	ClassPostProposalRequest,
	ClassPostProposalResponse,
	ClassTableMarker,
	Creator,
	Statement,
	StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import { containsBadLanguage } from '../fn_profanityChecker';
import { loadChallenge, loadMain, loadTables, requireId, requireUid } from './classroomAccess';
import { creatorOf, loadMembership } from './classroomMembers';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { writeLanguageFlag } from './languageFlags';
import { assertLessonNotEnded, assertLessonRunning } from './lessonStatusGuard';
import { noDeviceCreator, requireNoDeviceMember } from './noDeviceMembers';
import {
	assertBallotNotFrozen,
	assertMayAddProposal,
	cleanProposalText,
	ownProposalsOf,
} from './proposalLogic';

/**
 * `classPostProposal` (IA 24.3): a proposal under the lesson's challenge question,
 * written by the server so the AI language check cannot be skipped (the rules
 * refuse a client create there). Same fields as the phone wrote before: an option
 * with a `classTable` marker, which the consolidated `onStatementCreated` turns
 * into the author's auto +1.
 *
 * How many an author may send is the lesson's setting (`proposalLimitOf`, one
 * unless the teacher chose unlimited). The limit is checked again inside the
 * transaction that writes, so two sends racing past the first check cannot both land.
 *
 * `forStudentId` (the lesson's teacher only): the proposal is written for a student
 * without a device who sits at a table of this lesson. It counts as theirs in every
 * way, the limit included; `classTable.enteredByUid` says who entered it, and no
 * name goes on the document.
 *
 * Refused words: nothing is written, the teacher is flagged, the answer is
 * `{ ok: false, reason: 'language' }`. A detector failure passes the text (see
 * containsBadLanguage): a failure must never accuse a child. The teacher's
 * own text is not checked. `proposalId` is the client's, so a retry after a
 * dropped answer is the same write.
 */

export interface PostProposalDeps {
	/** True when the text should be refused. Fails open (see containsBadLanguage). */
	detect: (text: string) => Promise<boolean>;
	now?: () => number;
}

const ALREADY_EXISTS = 6; // gRPC status of create() on an existing document

interface ProposalAuthor {
	id: string;
	creator: Creator;
	marker: ClassTableMarker;
}

/** Who the proposal belongs to: the caller, or the student the teacher is entering it for. */
async function resolveAuthor(
	firestore: Firestore,
	actorUid: string,
	req: ClassPostProposalRequest,
	mainId: string,
	main: Statement,
	teacher: boolean,
	sub: StatementSubscription | undefined,
): Promise<ProposalAuthor> {
	if (req.forStudentId === undefined || req.forStudentId === null) {
		return {
			id: actorUid,
			creator: creatorOf(actorUid, sub, main),
			// The table is server-written on the student's subscription: the auto +1 needs it to match.
			marker: { tableId: sub?.tableId ?? '', shared: false, coAuthors: [] },
		};
	}
	if (!teacher) {
		throw new ClassroomError('permission-denied', "Only the lesson's teacher can do this");
	}
	const { member, table } = requireNoDeviceMember(
		await loadTables(firestore, mainId),
		mainId,
		requireId(req.forStudentId, 'forStudentId'),
	);

	return {
		id: member.id,
		creator: noDeviceCreator(member.id),
		marker: { tableId: table.tableId, shared: false, coAuthors: [], enteredByUid: actorUid },
	};
}

export async function postProposal(
	firestore: Firestore,
	actorUid: string,
	req: ClassPostProposalRequest,
	deps: PostProposalDeps,
): Promise<ClassPostProposalResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const proposalId = requireId(req?.proposalId, 'proposalId');
	const text = cleanProposalText(req?.text);
	const main = await loadMain(firestore, mainId);
	const { teacher, sub } = await loadMembership(firestore, mainId, actorUid, main);
	if (teacher) assertLessonNotEnded(main);
	else assertLessonRunning(main);
	const author = await resolveAuthor(firestore, actorUid, req, mainId, main, teacher, sub);

	const challenge = await loadChallenge(firestore, mainId);
	assertBallotNotFrozen(challenge);
	const limit = proposalLimitOf(main);
	const authorsProposals = firestore
		.collection(Collections.statements)
		.where('parentId', '==', challenge.statementId)
		.where('creatorId', '==', author.id);
	const held = ownProposalsOf(
		(await authorsProposals.get()).docs.map((d) => d.data() as Statement),
		challenge.statementId,
		author.id,
	);
	// A retry after a dropped answer is the same write, whichever of the author's proposals it is.
	if (held.some((p) => p.statementId === proposalId)) return { ok: true, proposalId };
	assertMayAddProposal(limit, held.length);

	const now = (deps.now ?? Date.now)();
	if (!teacher && (await deps.detect(text))) {
		await writeLanguageFlag(firestore, {
			mainId,
			uid: actorUid,
			kind: 'proposal',
			text,
			maxLength: CLASS_PROPOSAL_MAX_LENGTH,
			now,
		});

		return { ok: false, reason: 'language' };
	}

	const built = createStatementObject({
		statementId: proposalId,
		statement: text,
		statementType: StatementType.option,
		parentId: challenge.statementId,
		parentAccessScope: challenge.accessScope,
		topParentId: main.topParentId || mainId,
		parents: [...(main.parents ?? []), mainId, challenge.statementId],
		creatorId: author.id,
		creator: author.creator,
	});
	if (!built) throw new ClassroomError('internal', 'The proposal could not be built');
	const ref = firestore.collection(Collections.statements).doc(proposalId);
	try {
		await firestore.runTransaction(async (tx) => {
			const fresh = ownProposalsOf(
				(await tx.get(authorsProposals)).docs.map((d) => d.data() as Statement),
				challenge.statementId,
				author.id,
			);
			if (fresh.some((p) => p.statementId === proposalId)) return;
			assertMayAddProposal(limit, fresh.length);
			tx.create(ref, { ...built, createdAt: now, lastUpdate: now, classTable: author.marker });
		});
	} catch (error) {
		if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
		// Two sends of the same id raced: the first one wrote it. An id that is someone else's is no
		// retry: answering "sent" there would tell the writer their words landed when they did not.
		const existing = (await ref.get()).data() as Statement | undefined;
		if (existing?.creatorId !== author.id) {
			throw new ClassroomError(
				'failed-precondition',
				'This proposal id is taken',
				'proposal-id-taken',
			);
		}
	}

	return { ok: true, proposalId };
}

export const classPostProposal = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassPostProposalRequest>,
	): Promise<ClassPostProposalResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await postProposal(db, uid, request.data, { detect: containsBadLanguage });
		} catch (error) {
			// Never the text: it is a child's words, and this is Cloud Logging.
			throw toHttpsError(error, {
				operation: 'classroom.classPostProposal',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: {
					proposalId: request.data?.proposalId,
					forStudentId: request.data?.forStudentId,
				},
			});
		}
	},
);
