import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_PROPOSAL_MAX_LENGTH,
	Collections,
	StatementType,
	createStatementObject,
	functionConfig,
} from '@freedi/shared-types';
import type {
	ClassPostProposalRequest,
	ClassPostProposalResponse,
	ClassTableMarker,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { containsBadLanguage } from '../fn_profanityChecker';
import { loadChallenge, loadMain, requireId, requireUid } from './classroomAccess';
import { creatorOf, loadMembership } from './classroomMembers';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { writeLanguageFlag } from './languageFlags';
import { assertLessonNotEnded, assertLessonRunning } from './lessonStatusGuard';
import { assertBallotNotFrozen, cleanProposalText, ownProposalOf } from './proposalLogic';

/**
 * `classPostProposal` (IA 24.3): the student's one proposal under the lesson's
 * challenge question, written by the server so the AI language check cannot be
 * skipped (the rules refuse a client create there). Same fields as the phone
 * wrote before: an option with a `classTable` marker, which the consolidated
 * `onStatementCreated` turns into the author's auto +1.
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

	const challenge = await loadChallenge(firestore, mainId);
	assertBallotNotFrozen(challenge);
	const mine = await firestore
		.collection(Collections.statements)
		.where('parentId', '==', challenge.statementId)
		.where('creatorId', '==', actorUid)
		.get();
	const existing = ownProposalOf(
		mine.docs.map((d) => d.data() as Statement),
		challenge.statementId,
		actorUid,
	);
	if (existing) {
		// A retry after a dropped answer is the same write; a second, different proposal is an edit.
		if (existing.statementId === proposalId) return { ok: true, proposalId };
		throw new ClassroomError(
			'failed-precondition',
			'You already have a proposal: edit it',
			'already-proposed',
		);
	}

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
		topParentId: main.topParentId || mainId,
		parents: [...(main.parents ?? []), mainId, challenge.statementId],
		creatorId: actorUid,
		creator: creatorOf(actorUid, sub, main),
	});
	if (!built) throw new ClassroomError('internal', 'The proposal could not be built');
	// The table is server-written on the student's subscription: the auto +1 needs it to match.
	const marker: ClassTableMarker = { tableId: sub?.tableId ?? '', shared: false, coAuthors: [] };
	try {
		await firestore
			.collection(Collections.statements)
			.doc(proposalId)
			.create({ ...built, createdAt: now, lastUpdate: now, classTable: marker });
	} catch (error) {
		// Two sends of the same id raced: the first one wrote it.
		if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
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
				metadata: { proposalId: request.data?.proposalId },
			});
		}
	},
);
