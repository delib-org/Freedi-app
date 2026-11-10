import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import { DocumentSnapshot, FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	isVoteSentinel,
	maxKeyInObject,
	Statement,
	statementToSimpleStatement,
	VoteSchema,
} from '@freedi/shared-types';

import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import { trackVoteEngagement } from './engagement/credits/trackEngagement';
import { onVoteCreatedStats } from './fn_adminStats';
import { logError } from './utils/errorHandling';

export async function updateVote(event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) {
	if (!event?.data) return;
	// A deleted vote (a reset) never subtracts from the tally: classResetVote clears it itself.
	if (!event.data.after.exists) return;

	try {
		const newVote = parse(VoteSchema, event.data.after.data());
		const { statementId: newVoteOptionId } = newVote;

		await updateParentStatementVotes();

		//update top voted

		const parentStatementDB = await db.doc(`${Collections.statements}/${newVote.parentId}`).get();
		if (!parentStatementDB.exists)
			throw new Error(`parentStatement ${newVote.parentId} do not exists`);

		const parentStatement = parentStatementDB.data() as Statement;
		const { selections, topVotedOption: previousTopVotedOption } = parentStatement;
		// Withdrawals (`none`) and the against side of a one-candidate ballot
		// live in `selections` too, but name no option doc — the leading REAL
		// option is what gets marked, and when there is none, nothing is.
		const realSelections: Record<string, number> = Object.fromEntries(
			Object.entries((selections ?? {}) as Record<string, number>).filter(
				([optionId]) => !isVoteSentinel(optionId),
			),
		);
		const topVotedId =
			Object.keys(realSelections).length > 0 ? maxKeyInObject(realSelections) : undefined;

		// The leader's flag, and the copy on the question, only move when the
		// leader does: each write to an option wakes every trigger on that doc.
		// `topVotedOption` is written last, so a run that stops halfway leaves the
		// old leader recorded and the next vote finishes the move.
		if (topVotedId && previousTopVotedOption?.statementId !== topVotedId) {
			await moveLeaderFlag(newVote.parentId, topVotedId);

			const topVotedOptionDB = await db.doc(`${Collections.statements}/${topVotedId}`).get();

			if (!topVotedOptionDB.exists) throw new Error(`topVotedOption ${topVotedId} do not exists`);
			const topVotedOption = topVotedOptionDB.data() as Statement;

			await db.doc(`${Collections.statements}/${newVote.parentId}`).update({
				topVotedOption: statementToSimpleStatement(topVotedOption),
			});

			logger.info(`Vote updated successfully for parentId: ${newVote.parentId}`);
		}

		// Track engagement (non-blocking)
		if (newVote.userId) {
			trackVoteEngagement(
				newVoteOptionId,
				newVote.userId,
				newVote.parentId,
				parentStatement.topParentId,
			).catch((err) => logger.warn('Engagement tracking failed:', err));
		}

		// Track admin stats on first vote only (non-blocking)
		if (!event.data?.before?.data()) {
			onVoteCreatedStats(newVote.createdAt).catch((err) =>
				logger.warn('Admin stats tracking failed:', err),
			);
		}

		return true;

		async function updateParentStatementVotes() {
			if (event.data?.before?.data() !== undefined) {
				const previousVote = parse(VoteSchema, event.data.before.data());

				const previousVoteOptionId = previousVote.statementId;

				if (newVoteOptionId === previousVoteOptionId) {
					throw new Error('new and previous are the same');
				} else {
					logger.info('new and previous are not the same');
					await db.doc(`statements/${newVote.parentId}`).update({
						[`selections.${newVoteOptionId}`]: FieldValue.increment(1),
						[`selections.${previousVoteOptionId}`]: FieldValue.increment(-1),
					});
				}
			} else {
				//second or more votes
				await db.doc(`statements/${newVote.parentId}`).update({
					[`selections.${newVoteOptionId}`]: FieldValue.increment(1),
				});
			}
		}
	} catch (error) {
		logError(error, { operation: 'vote.updateVote', metadata: { voteId: event.data.after.id } });

		return false;
	}
}

/** Clears `isVoted` from every option that has it, then sets it on the leader. */
async function moveLeaderFlag(parentId: string, leaderId: string): Promise<void> {
	const flagged = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('isVoted', '==', true)
		.get();

	const batch = db.batch();
	flagged.docs.forEach((resultDB) => {
		const result = resultDB.data() as Statement;
		batch.update(db.doc(`${Collections.statements}/${result.statementId}`), { isVoted: false });
	});
	await batch.commit();

	await db.doc(`${Collections.statements}/${leaderId}`).update({ isVoted: true });
}
