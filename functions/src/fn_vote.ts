import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import { DocumentSnapshot, FieldValue } from 'firebase-admin/firestore';
import { Collections } from '../../src/types/TypeEnums';
import {
	Statement,
} from '../../src/types/statement/Statement';
import { maxKeyInObject } from '../../src/types/TypeUtils';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import { VoteSchema } from '../../src/types/vote';

export async function updateVote(
	event: FirestoreEvent<Change<DocumentSnapshot> | undefined>
) {
	if (!event?.data) return;

	try {
		const newVote = parse(VoteSchema, event.data.after.data());
		const { statementId: newVoteOptionId } = newVote;
		if (event.data.before.data() !== undefined) {
			const previousVote = parse(
				VoteSchema,
				event.data.before.data()
			);

			const previousVoteOptionId = previousVote.statementId;

			if (newVoteOptionId === previousVoteOptionId) {
				throw new Error('new and previous are the same');
			} else {
				logger.info('new and previous are not the same');
				await db.doc(`statements/${newVote.parentId}`).update({
					[`selections.${newVoteOptionId}`]: FieldValue.increment(1),
					[`selections.${previousVoteOptionId}`]:
						FieldValue.increment(-1),
				});
			}
		} else {
			//second or more votes
			await db.doc(`statements/${newVote.parentId}`).update({
				[`selections.${newVoteOptionId}`]: FieldValue.increment(1),
			});
		}

		//update top voted

		const parentStatementDB = await db
			.doc(`${Collections.statements}/${newVote.parentId}`)
			.get();
		if (!parentStatementDB.exists)
			throw new Error(
				`parentStatement ${newVote.parentId} do not exists`
			);

		const parentStatement = parentStatementDB.data() as Statement;
		const { selections } = parentStatement;
		const topVotedId = maxKeyInObject(selections);

		// remove previous results
		const batch = db.batch();

		const previousResultsDB = await db
			.collection(Collections.statements)
			.where('parentId', '==', newVote.parentId)
			.where('selected', '==', true)
			.get();

		previousResultsDB.forEach((resultDB) => {
			const result = resultDB.data() as Statement;
			const docRef = db.doc(
				`${Collections.statements}/${result.statementId}`
			);
			batch.update(docRef, { selected: false });
		});

		// Commit the batch
		await batch.commit();

		await db
			.doc(`${Collections.statements}/${topVotedId}`)
			.update({ selected: true });

		return true;
	} catch (error) {
		logger.error(error);

		return false;
	}
}
