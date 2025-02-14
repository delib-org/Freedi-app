import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	createStatement,
	setStatementToDB,
} from '@/controllers/db/statements/setStatements';
import { MassConsensusPageUrls, StatementType } from '@/types/TypeEnums';
import { GeneratedStatement } from '@/types/massConsensus/massConsensusModel';
import { Statement } from '@/types/statement/Statement';
import { useNavigate, useParams } from 'react-router';

export function useSimilarSuggestions() {
	const navigate = useNavigate();
	const { statementId: parentId } = useParams<{ statementId: string }>();

	async function handleSetSuggestionToDB(
		statement: Statement | GeneratedStatement
	) {
		try {
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
				await setEvaluationToDB(newStatement, 1);
			} else {
				const newStatement = statement as Statement;
				//if statementId !== null evaluate +1 the statement
				await setEvaluationToDB(newStatement, 1);
			}

			navigate(
				`/mass-consensus/${parentId}/${MassConsensusPageUrls.randomSuggestions}`
			);

			return;
		} catch (error) {
			console.error(error);
		}
	}

	return {
		handleSetSuggestionToDB,
	};
}
