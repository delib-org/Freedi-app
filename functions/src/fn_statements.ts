import { logger } from 'firebase-functions';
import {
	Timestamp,
	FieldValue,
	QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { db } from './index';
import { Collections } from '../../src/types/enums';
import { StatementSchema } from '../../src/types/statement';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';

// TODO: Where is this used?
// export async function updateSubscribedListenersCB(event: any) {
// 	//get statement
// 	const { statementId } = event.params;
// 	//get all subscribers to this statement
// 	const subscribersRef = db.collection(Collections.statementsSubscribe);
// 	const q = subscribersRef.where('statementId', '==', statementId);
// 	const subscribersDB = await q.get();
// 	//update all subscribers
// 	subscribersDB.docs.forEach((doc: any) => {
// 		try {
// 			const subscriberId = doc.data().statementsSubscribeId;
// 			if (!subscriberId) throw new Error('subscriberId not found');

// 			db.doc(`statementsSubscribe/${subscriberId}`).set(
// 				{
// 					lastUpdate: Timestamp.now().toMillis(),
// 				},
// 				{ merge: true }
// 			);
// 		} catch (error) {
// 			logger.error('error updating subscribers', error);
// 		}
// 	});
// }

export async function updateParentWithNewMessageCB(
	e: FirestoreEvent<
		QueryDocumentSnapshot | undefined,
		{
			statementId: string;
		}
	>
) {
	if (!e.data) return;
	try {
		//get parentId
		const _statement = parse(StatementSchema, e.data.data());
		const { parentId, topParentId, statementId, statement } = _statement;

		if (parentId === 'top') return;

		if (!parentId) throw new Error('parentId not found');

		//get parent
		const parentRef = db.doc(`${Collections.statements}/${parentId}`);

		//update parent
		const lastMessage = statement;
		const lastUpdate = Timestamp.now().toMillis();
		parentRef.update({
			lastMessage,
			lastUpdate,
			totalSubStatements: FieldValue.increment(1),
		});

		//update topParent
		if (!topParentId) throw new Error('topParentId not found');
		if (topParentId === 'top')
			throw new Error(
				'topParentId is top, and it is an error in the client logic'
			);

		const topParentRef = db.doc(`statements/${topParentId}`);
		topParentRef.update({ lastChildUpdate: lastUpdate, lastUpdate });

		//create statement metadata
		const statementMetaRef = db.doc(
			`${Collections.statementsMetaData}/${statementId}`
		);
		await statementMetaRef.set({ statementId }, { merge: true });

		return;
	} catch (error) {
		logger.error(error);

		return;
	}
}
