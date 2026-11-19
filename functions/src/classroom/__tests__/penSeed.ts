import type {
	ClassPostProposalRequest,
	ClassPostProposalResponse,
	ClassTable,
} from '@freedi/shared-types';
import { postProposal } from '../fn_classPostProposal';
import type { PostProposalDeps } from '../fn_classPostProposal';
import { FakeFirestore } from './fakeFirestore';

/**
 * At Proposals a student's send needs the table's pen (Trello fJij2wMx). Tests of what a
 * proposal is (words, limits, ids) are not about the pen, so they send through this: the
 * student's table is put at write with the pen in their hand, then the real callable runs.
 */

export function tableWithPen(tableId: string, mainId: string, uid: string): ClassTable {
	return {
		tableId,
		mainId,
		n: 1,
		memberUids: [uid],
		noDeviceMembers: [],
		step: 'write',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [uid],
		usedQuestionIds: [],
		writerUid: uid,
		updatedAt: 0,
	};
}

export function postWithPen(
	fake: FakeFirestore,
	uid: string,
	req: ClassPostProposalRequest,
	deps: PostProposalDeps,
): Promise<ClassPostProposalResponse> {
	const sub = fake.read(`statementsSubscribe/${uid}--${req.mainId}`) as
		| { tableId?: string }
		| undefined;
	if (sub?.tableId)
		fake.seed(`classTables/${sub.tableId}`, tableWithPen(sub.tableId, req.mainId, uid));

	return postProposal(fake.asFirestore(), uid, req, deps);
}
