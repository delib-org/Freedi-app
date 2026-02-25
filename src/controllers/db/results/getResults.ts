import { collection, getDocs, limit, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { FireStore } from '../config';
import {
	Collections,
	StatementType,
	Statement,
	StatementSchema,
	ResultsBy,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { normalizeStatementData } from '@/helpers/timestampHelpers';

import { store } from '@/redux/store';
import { deleteStatement, setStatement } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';

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
		logError(error, { operation: 'results.getResults.getResultsDB' });

		return [];
	}
}

async function getTopOptionsDB(statement: Statement): Promise<Statement[]> {
	try {
		const { resultsSettings } = statement;
		const numberOfOptions = resultsSettings?.numberOfResults || 1;

		// Fetch all options under this parent (can't orderBy nested field in Firestore)
		const topOptionsRef = collection(FireStore, Collections.statements);
		const q = query(topOptionsRef, where('parentId', '==', statement.statementId));
		const topOptionsSnap = await getDocs(q);

		const topOptions = topOptionsSnap.docs.map((doc) => {
			// Normalize statement data (converts timestamps and fills missing topParentId)
			const data = normalizeStatementData(doc.data()) as Record<string, unknown>;

			// Ensure averageEvaluation exists if evaluation is present
			const evaluation = data.evaluation as Record<string, unknown> | undefined;
			if (evaluation && !('averageEvaluation' in evaluation)) {
				evaluation.averageEvaluation =
					(evaluation.sumEvaluations as number) /
					Math.max(evaluation.numberOfEvaluators as number, 1);
			}

			return parse(StatementSchema, data);
		});

		// Sort by evaluation.agreement (falling back to consensus for legacy data)
		// and return top N options
		return topOptions
			.sort(
				(a, b) =>
					(b.evaluation?.agreement ?? b.consensus ?? 0) -
					(a.evaluation?.agreement ?? a.consensus ?? 0),
			)
			.slice(0, numberOfOptions);
	} catch (error) {
		logError(error, { operation: 'results.getResults.topOptions' });

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
			where('statementType', '!=', StatementType.statement),
			orderBy('createdAt', 'asc'),
			limit(40),
		);

		return onSnapshot(q, (sts) => {
			sts.docChanges().forEach((change) => {
				try {
					// Normalize statement data (converts timestamps and fills missing topParentId)
					const data = normalizeStatementData(change.doc.data()) as Record<string, unknown>;

					// Ensure averageEvaluation exists if evaluation is present
					const evaluation = data.evaluation as Record<string, unknown> | undefined;
					if (evaluation && !('averageEvaluation' in evaluation)) {
						evaluation.averageEvaluation =
							(evaluation.sumEvaluations as number) /
							Math.max(evaluation.numberOfEvaluators as number, 1);
					}
					const statement = parse(StatementSchema, data);
					if (change.type === 'added' || change.type === 'modified') {
						dispatch(setStatement(statement));
					} else if (change.type === 'removed') {
						dispatch(deleteStatement(statement.statementId));
					}
				} catch (error) {
					logError(error, {
						operation: 'results.listenToDescendants.parseStatement',
						metadata: { documentData: change.doc.data() },
					});
				}
			});
		});
	} catch (error) {
		logError(error, { operation: 'results.getResults.unknown' });

		return () => {
			return;
		};
	}
}
