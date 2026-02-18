import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import { DocumentSnapshot, FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	maxKeyInObject,
	Statement,
	statementToSimpleStatement,
	VoteSchema,
} from '@freedi/shared-types';

import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';

export async function updateVote(event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) {
	if (!event?.data) return;

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
		const topVotedId = maxKeyInObject(selections);

		// remove previous results
		const batch = db.batch();

		const previousResultsDB = await db
			.collection(Collections.statements)
			.where('parentId', '==', newVote.parentId)
			.where('isVoted', '==', true)
			.get();

		previousResultsDB.forEach((resultDB) => {
			const result = resultDB.data() as Statement;
			const docRef = db.doc(`${Collections.statements}/${result.statementId}`);
			batch.update(docRef, { isVoted: false });
		});

		// Commit the batch
		await batch.commit();

		//mark the new top voted option as selected
		await db.doc(`${Collections.statements}/${topVotedId}`).update({ isVoted: true });

		//check if the topVoted option is the same as the previous one
		//if not, update the topVoted option in the parent statement
		if (previousTopVotedOption?.statementId !== topVotedId) {
			//get topVoted option:
			const topVotedOptionDB = await db.doc(`${Collections.statements}/${topVotedId}`).get();

			if (!topVotedOptionDB.exists) throw new Error(`topVotedOption ${topVotedId} do not exists`);
			const topVotedOption = topVotedOptionDB.data() as Statement;

			const simpleStatement = statementToSimpleStatement(topVotedOption);

			await db.doc(`${Collections.statements}/${newVote.parentId}`).update({
				topVotedOption: simpleStatement,
			});

			logger.info(`Vote updated successfully for parentId: ${newVote.parentId}`);
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
		logger.error(error);

		return false;
	}
}
