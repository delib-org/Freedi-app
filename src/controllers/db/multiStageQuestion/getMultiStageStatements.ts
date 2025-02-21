import * as v from 'valibot';
import { isProduction } from '@/controllers/general/helpers';
import { setCurrentMultiStepOptions } from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { Statement, StatementSchema } from '@/types/statement/Statement';
import { functionConfig } from '@/types/ConfigFunctions';
import firebaseConfig from '../configKey';

export async function getFirstEvaluationOptions(
	statement: Statement | undefined
): Promise<void> {
	try {
		if (!statement) return;
		const dispatch = store.dispatch;

		const endPoint =
			location.hostname === 'localhost'
				? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getRandomStatements`
				: import.meta.env.VITE_APP_RANDOM_STATEMENTS_ENDPOINT;

		const response = await fetch(
			`${endPoint}?parentId=${statement.statementId}&limit=6`
		);
		const { randomStatements, error } = await response.json();
		if (error) throw new Error(error);
		v.parse(randomStatements, v.array(StatementSchema));

		dispatch(setCurrentMultiStepOptions(randomStatements));
	} catch (error) {
		console.error(error);
	}
}

export async function getSecondEvaluationOptions(
	statement: Statement | undefined
): Promise<void> {
	try {
		if (!statement) return;
		const dispatch = store.dispatch;

		const endPoint = isProduction()
			? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getTopStatements`
			: import.meta.env.VITE_APP_TOP_STATEMENTS_ENDPOINT;

		const response = await fetch(
			`${endPoint}?parentId=${statement.statementId}&limit=10`
		);
		const { topSolutions, error } = await response.json();
		if (error) throw new Error(error);

		v.parse(topSolutions, v.array(StatementSchema));
		dispatch(setCurrentMultiStepOptions(topSolutions));
	} catch (error) {
		console.error(error);
	}
}
