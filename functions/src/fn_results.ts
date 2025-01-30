import { logger } from 'firebase-functions/v1';
import { db } from './index';
import { Statement } from '../../src/types/statement';
import { Collections } from '../../src/types/enums';

export async function updateResultsSettings(ev: any): Promise<Statement[]> {
	try {
		//get results
		const { resultsBy } = ev.data.after.data();
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
		// statementRef
		// const statementRef = db.collection(Collections.statements).doc(statementId);
		// const statementDB = await statementRef.get();
		// const statement = statementDB.data() as Statement;

		//get top options
		const topOptionsDB = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.orderBy('consensus', 'desc')
			.limit(5)
			.get();
		const topOptions = topOptionsDB.docs.map(
			(doc: any) => doc.data() as Statement
		);

		return topOptions;
	} catch (error) {
		logger.error(error);

		return [];
	}
}
