import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';
import {
	Statement,
	StatementSchema,
	ResultsSettingsSchema,
	Collections
} from '@freedi/shared-types';

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
		// Fetch all options under this parent (can't orderBy nested field in Firestore)
		const topOptionsDB = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.get();

		const topOptions = topOptionsDB.docs.map((doc) =>
			parse(StatementSchema, doc.data())
		);

		// Sort by evaluation.agreement (falling back to consensus for legacy data)
		// and return top 5
		return topOptions
			.sort((a, b) => (b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0))
			.slice(0, 5);
	} catch (error) {
		logger.error(error);

		return [];
	}
}
