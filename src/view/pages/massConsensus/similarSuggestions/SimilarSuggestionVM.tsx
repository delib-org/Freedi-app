import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	createStatement,
	setStatementToDB,
} from '@/controllers/db/statements/setStatements';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

import {
	GeneratedStatement,
	Statement,
	MassConsensusPageUrls,
	StatementType,
} from 'delib-npm';
import { useState } from 'react';

import { useNavigate, useParams } from 'react-router';

export function useSimilarSuggestions() {
	const navigate = useNavigate();
	const { statementId: parentId } = useParams<{ statementId: string }>();
	const { creator } = useAuthentication();
	const [loading, setLoading] = useState(false);

	async function handleSetSuggestionToDB(
		statement: Statement | GeneratedStatement
	) {
		try {
			setLoading(true);
			const parentStatement = await getStatementFromDB(parentId);
			if (!parentStatement)
				throw new Error('Error getting parent statement from DB');

			//if statementId === null save new to DB
			if (!statement.statementId) {
				const newStatement: Statement = createStatement({
					text: statement.statement,
					parentStatement,
					statementType: StatementType.option,
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

			navigate(
				`/mass-consensus/${parentId}/${MassConsensusPageUrls.randomSuggestions}`
			);
			setLoading(false);
			
			return;
		} catch (error) {
			console.error(error);
		}
	}

	return {
		handleSetSuggestionToDB,
		loading,
	};
}
