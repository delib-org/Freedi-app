import {
	collection,
	getDocs,
	limit,
	query,
	where,
	orderBy,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections } from '@/types/enums';
import { Statement, StatementSchema } from '@/types/statement';
import { parse } from 'valibot';

export async function getResultsDB(statement: Statement): Promise<Statement[]> {
	try {
		parse(StatementSchema, statement);

		const { resultsSettings } = statement;
		const resultsBy = resultsSettings?.resultsBy || ResultsBy.topOptions;

		switch (resultsBy) {
			case ResultsBy.topOptions:
				return await getTopOptionsDB(statement);
			default:
				return [];
		}
	} catch (error) {
		console.error(error);

		return [];
	}
}

async function getTopOptionsDB(statement: Statement): Promise<Statement[]> {
	try {
		const { resultsSettings } = statement;
		const numberOfOptions = resultsSettings?.numberOfResults || 1;

		const topOptionsRef = collection(FireStore, Collections.statements);
		const q = query(
			topOptionsRef,
			where('parentId', '==', statement.statementId),
			orderBy('consensus', 'asc'),
			limit(numberOfOptions)
		);
		const topOptionsSnap = await getDocs(q);

		const topOptions = topOptionsSnap.docs.map(
			(doc) => doc.data() as Statement
		);

		z.array(StatementSchema).parse(topOptions);

		return topOptions;
	} catch (error) {
		console.error(error);

		return [];
	}
}
