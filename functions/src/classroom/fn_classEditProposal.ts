import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { CLASS_PROPOSAL_MAX_LENGTH, Collections, functionConfig } from '@freedi/shared-types';
import type {
	ClassEditProposalRequest,
	ClassEditProposalResponse,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { containsBadLanguage } from '../fn_profanityChecker';
import { loadChallenge, loadMain, requireId, requireUid } from './classroomAccess';
import { loadMembership } from './classroomMembers';
import { toHttpsError } from './classroomErrors';
import { writeLanguageFlag } from './languageFlags';
import { assertLessonNotEnded, assertLessonRunning } from './lessonStatusGuard';
import { assertBallotNotFrozen, assertEditableProposal, cleanProposalText } from './proposalLogic';

/**
 * `classEditProposal` (IA 24.3): the writer changes the text of their proposal
 * until the vote opens. The same language check as a new proposal runs first
 * (the rules refuse a client text update there): refused words leave the old
 * text as it was, flag the teacher, and answer `{ ok: false, reason: 'language' }`.
 */

export interface EditProposalDeps {
	/** True when the text should be refused. Fails open (see containsBadLanguage). */
	detect: (text: string) => Promise<boolean>;
	now?: () => number;
}

export async function editProposal(
	firestore: Firestore,
	actorUid: string,
	req: ClassEditProposalRequest,
	deps: EditProposalDeps,
): Promise<ClassEditProposalResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const proposalId = requireId(req?.proposalId, 'proposalId');
	const text = cleanProposalText(req?.text);
	const main = await loadMain(firestore, mainId);
	const { teacher } = await loadMembership(firestore, mainId, actorUid, main);
	if (teacher) assertLessonNotEnded(main);
	else assertLessonRunning(main);

	const challenge = await loadChallenge(firestore, mainId);
	assertBallotNotFrozen(challenge);
	const snap = await firestore.collection(Collections.statements).doc(proposalId).get();
	const proposal = snap.exists ? (snap.data() as Statement) : undefined;
	assertEditableProposal(proposal, challenge.statementId, actorUid, teacher);

	const now = (deps.now ?? Date.now)();
	if (!teacher && (await deps.detect(text))) {
		await writeLanguageFlag(firestore, {
			mainId,
			uid: actorUid,
			kind: 'proposal',
			targetId: proposalId,
			text,
			maxLength: CLASS_PROPOSAL_MAX_LENGTH,
			now,
		});

		return { ok: false, reason: 'language' };
	}
	await firestore
		.collection(Collections.statements)
		.doc(proposalId)
		.update({ statement: text, lastUpdate: now });

	return { ok: true, proposalId };
}

export const classEditProposal = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassEditProposalRequest>,
	): Promise<ClassEditProposalResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await editProposal(db, uid, request.data, { detect: containsBadLanguage });
		} catch (error) {
			// Never the text: it is a child's words, and this is Cloud Logging.
			throw toHttpsError(error, {
				operation: 'classroom.classEditProposal',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { proposalId: request.data?.proposalId },
			});
		}
	},
);
