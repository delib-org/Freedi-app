/**
 * Opening the voting stage: decide who is on the ballot, and freeze it.
 *
 * Selection is deliberately NOT agora maths. The teacher's settings are
 * written onto the challenge question as ordinary `resultsSettings`, and the
 * shared selector every other Freedi app uses picks the leading options from
 * `statement.consensus`. Agora then snapshots that answer onto the session,
 * because the same selector keeps re-running on every later rating and the
 * ballot a class is voting on must not change underneath it.
 */

import { db } from '../db';
import {
	Collections,
	AgoraSession,
	SimpleStatement,
	Statement,
	VotingCandidate,
	resolveVotingSelection,
} from '@freedi/shared-types';
import { updateParentStatementWithChosenOptions } from '../evaluation/updateChosenOptions';
import { logError } from '../utils/errorHandling';

/**
 * Computes and persists the ballot for a session entering the voting stage.
 *
 * An empty ballot is a legitimate outcome — a class that never rated anything
 * has no leading proposals — and is written as such so the student screen can
 * say so instead of spinning.
 */
export async function prepareVotingStage(
	sessionId: string,
	explicitCandidateIds?: string[],
): Promise<void> {
	try {
		const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
		const sessionSnap = await sessionRef.get();
		if (!sessionSnap.exists) return;
		const session = sessionSnap.data() as AgoraSession;

		const questionId = session.challengeQuestionId;
		if (!questionId) return;

		// The auto-open rule names the ballot itself: the proposal the room
		// nearly all agreed on (for or against), or the two it broadly liked.
		// The shared selector is skipped — it would answer a different question.
		if (explicitCandidateIds && explicitCandidateIds.length > 0) {
			const docs = await Promise.all(
				explicitCandidateIds.map((statementId) =>
					db.collection(Collections.statements).doc(statementId).get(),
				),
			);
			const candidates: VotingCandidate[] = docs
				.filter((docSnap) => docSnap.exists)
				.map((docSnap) => {
					const statement = docSnap.data() as Statement;

					return {
						statementId: statement.statementId,
						statement: String(statement.statement ?? ''),
						consensus: Number(statement.consensus ?? 0),
					};
				});
			await sessionRef.update({
				voting: {
					candidateIds: candidates.map((candidate) => candidate.statementId),
					candidates,
					computedAt: Date.now(),
				},
				lastUpdate: Date.now(),
			});

			return;
		}

		// The teacher's choice, expressed in the shared vocabulary
		const selection = resolveVotingSelection(session.votingSettings);
		await db
			.collection(Collections.statements)
			.doc(questionId)
			.update({ resultsSettings: selection, lastUpdate: Date.now() });

		// The shared selector: sorts by consensus, slices top N or filters above
		// the cutoff, marks `isChosen`, and writes `results` on the question.
		await updateParentStatementWithChosenOptions(questionId);

		const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
		const question = questionSnap.data() as Statement | undefined;
		const results: SimpleStatement[] = question?.results ?? [];

		const candidates: VotingCandidate[] = results.map((result) => ({
			statementId: String(result.statementId),
			statement: String(result.statement ?? ''),
			consensus: Number(result.consensus ?? 0),
		}));

		await sessionRef.update({
			voting: {
				candidateIds: candidates.map((candidate) => candidate.statementId),
				candidates,
				computedAt: Date.now(),
			},
			lastUpdate: Date.now(),
		});
	} catch (error) {
		logError(error, {
			operation: 'agora.prepareVotingStage',
			metadata: { sessionId },
		});
	}
}
