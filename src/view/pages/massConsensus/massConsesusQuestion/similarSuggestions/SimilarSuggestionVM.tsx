import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { listenToAllSubStatements } from '@/controllers/db/statements/listenToStatements';
import {
	createStatement,
	setStatementToDB,
} from '@/controllers/db/statements/setStatements';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

import { GeneratedStatement, QuestionType, Statement, StatementType } from 'delib-npm';
import { useEffect } from 'react';

import { useNavigate, useParams } from 'react-router';

export function useSimilarSuggestions(statementId, nextStep) {
	const navigate = useNavigate();
	const { statementId: parentId } = useParams<{ statementId: string }>();
	const { creator } = useAuthentication();

	useEffect(() => {
		if (!parentId) return;

		const unsubscribe = listenToAllSubStatements(parentId);

		return () => unsubscribe();
	}, [parentId]);
	async function handleSetSuggestionToDB(
		statement: Statement | GeneratedStatement
	) {
		try {
			    if (!creator) return;
			const parentStatement = await getStatementFromDB(parentId);
			if (!parentStatement)
				throw new Error('Error getting parent statement from DB');

			//if statementId === null save new to DB
			if (!statement.statementId) {
				const newStatement: Statement = createStatement({
					text: statement.statement,
					parentStatement,
					statementType: StatementType.option,
					questionType:QuestionType.massConsensus
				});
				const { statementId: newStatementId } = await setStatementToDB({
					statement: newStatement,
					parentStatement,
				});
				if (!newStatementId)
					throw new Error('Error saving statement to DB');
				await setEvaluationToDB(newStatement, creator, 1);
			} else {
				const newStatement = statement as Statement;
				//if statementId !== null evaluate +1 the statement
				await setEvaluationToDB(newStatement, creator, 1);
			}

			navigate(`/mass-consensus/${statementId}/${nextStep}`);
		} catch (error) {
			console.error(error);
		}
	}

	return {
		handleSetSuggestionToDB,
	};
}
