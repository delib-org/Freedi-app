/**
 * Results for a room scored on AGREEMENT — no camps to bridge, no stance
 * baselines to converge: the proposals ranked by the plain net support the
 * room gave them, and the election if one was held.
 *
 * Numbers come from `agoraScores.classConsensus` (students only), falling
 * back to the statement's own evaluation block for a proposal the trigger
 * never reached. Written once; the results screen shows it as final.
 */

import { db } from '../db';
import {
	Collections,
	AgoraAgreementResults,
	AgoraCarriedAnswer,
	AgoraProposalScore,
	AgoraSession,
	Statement,
	StatementType,
	rankCarriedAnswers,
	isAgoraHidden,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { computeVoteOutcome } from './classScore';

export async function computeAgreementResults(sessionId: string): Promise<void> {
	try {
		const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
		const sessionSnap = await sessionRef.get();
		if (!sessionSnap.exists) return;
		const session = sessionSnap.data() as AgoraSession;
		const named = session.identity === 'named';

		const [proposalsSnap, scoresSnap] = await Promise.all([
			db
				.collection(Collections.statements)
				.where('agoraSessionId', '==', sessionId)
				.where('statementType', '==', StatementType.option)
				.get(),
			db.collection(Collections.agoraScores).where('sessionId', '==', sessionId).get(),
		]);
		const scores = new Map<string, AgoraProposalScore>(
			scoresSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as AgoraProposalScore]),
		);

		const proposals = proposalsSnap.docs
			.map((docSnap) => docSnap.data() as Statement)
			.filter(
				(statement) =>
					statement.parentId === session.challengeQuestionId && !isAgoraHidden(statement),
			);

		const rows: AgoraCarriedAnswer[] = proposals.map((statement) => {
			const consensus = scores.get(statement.statementId)?.classConsensus;
			const raters = consensus?.n ?? Number(statement.evaluation?.numberOfEvaluators ?? 0);
			const mean =
				consensus?.mean ?? (raters > 0 ? Number(statement.evaluation?.averageEvaluation ?? 0) : 0);

			return {
				statementId: statement.statementId,
				statement: statement.statement,
				mean: Number.isFinite(mean) ? mean : 0,
				raters,
				...(named && statement.anonName ? { anonName: statement.anonName } : {}),
			};
		});
		const ranked = rankCarriedAnswers(rows);
		const lead = ranked.find((row) => row.raters > 0);

		// The vote's win threshold is judged against the same net agreement the
		// rest of this screen shows — there is no C_p in an agreement room.
		const vote = await computeVoteOutcome(
			session,
			ranked.map((row) => ({
				statementId: row.statementId,
				text: row.statement,
				consensus: row.mean,
			})),
		);

		const agreement: AgoraAgreementResults = {
			ranked,
			...(lead ? { leadStatementId: lead.statementId } : {}),
			...(vote.voteWinnerStatementId ? { voteWinnerStatementId: vote.voteWinnerStatementId } : {}),
			...(vote.voteRejected !== undefined ? { voteRejected: vote.voteRejected } : {}),
			...(vote.voteCounts ? { voteCounts: vote.voteCounts } : {}),
			...(vote.voteTotal !== undefined ? { voteTotal: vote.voteTotal } : {}),
			...(vote.voteWinnerMetThreshold !== undefined
				? { voteWinnerMetThreshold: vote.voteWinnerMetThreshold }
				: {}),
			computedAt: Date.now(),
		};

		await sessionRef.update({ agreement, lastUpdate: Date.now() });
	} catch (error) {
		logError(error, { operation: 'agora.computeAgreementResults', metadata: { sessionId } });
	}
}
