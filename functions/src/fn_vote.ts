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

		if (topVotedId) {
			// Checked on every vote (usually one read): an interleaved vote can leave
			// the flags wrong, and this is what repairs them.
			await syncLeaderFlag(newVote.parentId, topVotedId);

			// Written after the flag, so a run that stops between the two leaves the
			// old leader recorded and the next vote finishes the move.
			if (previousTopVotedOption?.statementId !== topVotedId) {
				const topVotedOptionDB = await db.doc(`${Collections.statements}/${topVotedId}`).get();

				if (!topVotedOptionDB.exists) throw new Error(`topVotedOption ${topVotedId} do not exists`);
				const topVotedOption = topVotedOptionDB.data() as Statement;

				await db.doc(`${Collections.statements}/${newVote.parentId}`).update({
					topVotedOption: statementToSimpleStatement(topVotedOption),
				});

				logger.info(`Vote updated successfully for parentId: ${newVote.parentId}`);
			}
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

/**
 * Makes the leader the only option flagged `isVoted`, in one atomic batch.
 * Writes nothing when that is already true: each write to an option wakes every
 * trigger on that document.
 */
async function syncLeaderFlag(parentId: string, leaderId: string): Promise<void> {
	const flagged = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('isVoted', '==', true)
		.get();

	const staleFlags = flagged.docs.filter((doc) => doc.id !== leaderId);
	const leaderIsFlagged = staleFlags.length < flagged.docs.length;
	if (leaderIsFlagged && staleFlags.length === 0) return;

	const batch = db.batch();
	staleFlags.forEach((doc) => batch.update(doc.ref, { isVoted: false }));
	if (!leaderIsFlagged) {
		batch.update(db.doc(`${Collections.statements}/${leaderId}`), { isVoted: true });
	}
	await batch.commit();
}
