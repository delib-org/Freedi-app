import { logger } from 'firebase-functions';

import {
	FieldValue,
	QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { db } from './index';
import {
	Collections, StatementType,
	Statement,
	StatementSchema,
	LastMessage,
} from '@freedi/shared-types';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import { Response, Request } from 'firebase-functions/v1';

export async function updateNumberOfNewSubStatements(
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
		const _statement:Statement = parse(StatementSchema, e.data.data());
		const { parentId, topParentId, statementId } = _statement;

		if (parentId === 'top') return;

		if (!parentId) throw new Error('parentId not found');

		//get parent
		const parentRef = db.doc(`${Collections.statements}/${parentId}`);

		//update parent
		const lastMessage:LastMessage = {
			message: _statement.statement,
			creator: _statement.creator.displayName || "Anonymous",
			createdAt: Date.now(),
		}
		const lastUpdate = Date.now();
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

		const topParentRef = db.doc(`${Collections.statements}/${topParentId}`);
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

export async function getQuestionOptions(req: Request, res: Response) {
	try {
		const { statementId } = req.query;
		if (!statementId) throw new Error('statementId is required');

		const ref = db.collection(Collections.statements);
		const query = ref
			.where('parentId', '==', statementId)
			.where('statementType', '==', StatementType.option);
		const optionsDB = await query.get();
		const options = optionsDB.docs
			.map((doc) => doc.data() as Statement)
			.filter((statement) => !statement.hide);

		res.status(200).send({ options, ok: true });
	} catch (error) {
		console.error(error);
		res.status(500).send({ error: error, ok: false });
	}
}
