import {
	collection,
	getDocs,
	limit,
	query,
	where,
	orderBy,
	onSnapshot,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections } from '@/types/TypeEnums';
import { Statement, StatementSchema } from '@/types/statement/StatementTypes';
import { parse } from 'valibot';
import { ResultsBy } from '@/types/results/Results';
import { store } from '@/redux/store';
import { setStatement } from '@/redux/statements/statementsSlice';

export async function getResultsDB(statement: Statement): Promise<Statement[]> {
	try {

		const { resultsSettings } = statement;
		const resultsBy = resultsSettings?.resultsBy || ResultsBy.topOptions;

		if (resultsBy === ResultsBy.topOptions) {
			const temp = await getTopOptionsDB(statement);
			console.log(temp);

			return temp;
		} else {
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

		const topOptions = topOptionsSnap.docs.map((doc) =>
			parse(StatementSchema, doc.data())
		);

		return topOptions;
	} catch (error) {
		console.error(error);

		return [];
	}
}

export function listenToDescendants(statementId: string) {
	const dispatch = store.dispatch;
	try {
		const statementsRef = collection(FireStore, Collections.statements);
		const q = query(statementsRef, where('parents', 'array-contains', statementId), limit(40));

		return onSnapshot(q, (sts) => {
			sts.forEach(stDB => {
				const statement = parse(StatementSchema, stDB.data());
				dispatch(setStatement(statement));
			})
		}
		);

	} catch (error) {
		console.error(error);

		return () => { return; }

	}
}
