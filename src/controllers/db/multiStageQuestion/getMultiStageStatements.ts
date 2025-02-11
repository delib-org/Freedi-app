import * as v from 'valibot';
import { isProduction } from '@/controllers/general/helpers';
import { setCurrentMultiStepOptions } from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { Statement, StatementSchema } from '@/types/statement/statementTypes';
import { functionConfig } from '@/types/firebase/configFunctions';

// TODO: Change urls bellow to match new environment
export async function getFirstEvaluationOptions(
	statement: Statement | undefined
): Promise<void> {
	try {
		const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
		if (!statement) return;
		const dispatch = store.dispatch;
		const urlBase = isProduction()
			? 'qeesi7aziq-uc.a.run.app'
			: `http://localhost:5001/${projectId}/${functionConfig.region}`;

		const url = isProduction()
			? `https://getRandomStatements-${urlBase}`
			: `http://localhost:5001/${projectId}/${functionConfig.region}/getRandomStatements`;

		const response = await fetch(
			`${url}?parentId=${statement.statementId}&limit=6`
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
		const urlBase = isProduction()
			? 'qeesi7aziq-uc.a.run.app'
			: 'http://localhost:5001/synthesistalyaron/us-central1';

		const url = isProduction()
			? `https://getTopStatements-${urlBase}`
			: 'http://localhost:5001/synthesistalyaron/us-central1/getTopStatements';
		const response = await fetch(
			`${url}?parentId=${statement.statementId}&limit=10`
		);
		const { topSolutions, error } = await response.json();
		if (error) throw new Error(error);

		v.parse(topSolutions, v.array(StatementSchema));
		dispatch(setCurrentMultiStepOptions(topSolutions));
	} catch (error) {
		console.error(error);
	}
}
