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
import { Collections, StatementType, Statement, StatementSchema, ResultsBy } from 'delib-npm';
import { parse } from 'valibot';

import { store } from '@/redux/store';
import { deleteStatement, setStatement } from '@/redux/statements/statementsSlice';

export async function getResultsDB(statement: Statement): Promise<Statement[]> {
	try {

		const { resultsSettings } = statement;
		const resultsBy = resultsSettings?.resultsBy || ResultsBy.consensus;

		if (resultsBy === ResultsBy.consensus) {

			return await getTopOptionsDB(statement);
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

		const topOptions = topOptionsSnap.docs.map((doc) => {
			const data = doc.data();
			// Ensure averageEvaluation exists if evaluation is present
			if (data.evaluation && !('averageEvaluation' in data.evaluation)) {
				data.evaluation.averageEvaluation = data.evaluation.sumEvaluations / Math.max(data.evaluation.numberOfEvaluators, 1);
			}

			return parse(StatementSchema, data);
		});

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
		const q = query(
			statementsRef,
			where('parents', 'array-contains', statementId),
			where("statementType", "!=", StatementType.statement),
			orderBy("createdAt", "asc"),
			limit(40)
		);

		return onSnapshot(q, (sts) => {
			sts.docChanges().forEach(change => {
				try {
					const data = change.doc.data();
					// Ensure averageEvaluation exists if evaluation is present
					if (data.evaluation && !('averageEvaluation' in data.evaluation)) {
						data.evaluation.averageEvaluation = data.evaluation.sumEvaluations / Math.max(data.evaluation.numberOfEvaluators, 1);
					}
					const statement = parse(StatementSchema, data);
					if (change.type === 'added' || change.type === 'modified') {

						dispatch(setStatement(statement));
					} else if (change.type === 'removed') {
						dispatch(deleteStatement(statement.statementId));

					}
				} catch (error) {
					console.error('Error parsing statement:', error);
					console.error('Statement data:', change.doc.data());
				}
			});
		}
		);

	} catch (error) {
		console.error(error);

		return () => { return; }

	}
}
