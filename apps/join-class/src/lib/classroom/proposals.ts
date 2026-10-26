import { getRandomUID } from '@freedi/shared-types';
import { classEditProposal, classPostProposal } from './api';

/**
 * The student's proposal goes through the server (IA 24.3): the AI language
 * check runs before anything is published, and the rules refuse a client write
 * of a proposal. `ok: false` means the words were refused: nothing was written,
 * the text stays in the box, the teacher is flagged. The refused text is never
 * logged here (it is a child's words).
 */

export type ProposalResult = { ok: true } | { ok: false; reason: 'language' };

/** A fresh id for one send; reused on retry so the proposal is never written twice. */
export function newProposalId(): string {
	return getRandomUID();
}

/** Send the student's one proposal. */
export async function sendProposal(
	mainId: string,
	proposalId: string,
	text: string,
): Promise<ProposalResult> {
	try {
		const res = await classPostProposal({ mainId, proposalId, text });

		return res.ok ? { ok: true } : { ok: false, reason: res.reason };
	} catch (error) {
		console.error(
			'[C3] sendProposal failed',
			{ operation: 'proposals.sendProposal', mainId },
			error,
		);
		throw error;
	}
}

/** Change the text of the student's own proposal (until the vote opens). */
export async function changeProposal(
	mainId: string,
	proposalId: string,
	text: string,
): Promise<ProposalResult> {
	try {
		const res = await classEditProposal({ mainId, proposalId, text });

		return res.ok ? { ok: true } : { ok: false, reason: res.reason };
	} catch (error) {
		console.error(
			'[C3] changeProposal failed',
			{ operation: 'proposals.changeProposal', mainId, statementId: proposalId },
			error,
		);
		throw error;
	}
}
