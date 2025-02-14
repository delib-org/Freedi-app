import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import {
	Statement,
	StatementSchema,
} from '../../src/types/statement/Statement';
import { Collections } from '../../src/types/TypeEnums';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import { ResultsSettingsSchema } from '../../src/types/results/Results';

export async function updateResultsSettings(
	ev: FirestoreEvent<
		Change<DocumentSnapshot> | undefined,
		{
			statementId: string;
		}
	>
): Promise<Statement[] | undefined> {
	if (!ev.data) return;
	try {
		//get results
		const { resultsBy } = parse(
			ResultsSettingsSchema,
			ev.data.after.data()
		);
		const { statementId } = ev.params;

		if (!statementId) throw new Error('statementId is required');
		if (!resultsBy) throw new Error('resultsBy is required');

		const topStatements = await resultsByTopOptions(statementId);

		//save results to DB
		await db
			.collection(Collections.results)
			.doc(statementId)
			.set({ [resultsBy]: topStatements }, { merge: true });

		return topStatements;
	} catch (error) {
		logger.error(error);

		return [];
	}
}

async function resultsByTopOptions(statementId: string): Promise<Statement[]> {
	try {
		//get top options
		const topOptionsDB = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.orderBy('consensus', 'desc')
			.limit(5)
			.get();
		const topOptions = topOptionsDB.docs.map((doc) =>
			parse(StatementSchema, doc.data())
		);

		return topOptions;
	} catch (error) {
		logger.error(error);

		return [];
	}
}
