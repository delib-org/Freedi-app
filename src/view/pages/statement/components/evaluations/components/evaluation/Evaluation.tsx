import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import { Statement } from '@/types/statement/Statement';

interface EvaluationProps {
	parentStatement: Statement | undefined;
	statement: Statement;
}

const Evaluation: FC<EvaluationProps> = ({ parentStatement, statement }) => {
	try {
		if (!parentStatement) throw new Error('parentStatement is not defined');

		let shouldDisplayScore: boolean = !!parentStatement.statementSettings?.showEvaluation;
		if (statement.evaluation?.selectionFunction) shouldDisplayScore = false;

		if (parentStatement.statementSettings?.enhancedEvaluation) {
			return (
				<EnhancedEvaluation
					statement={statement}
					shouldDisplayScore={shouldDisplayScore}
				/>
			);
		}

		return (
			<SimpleEvaluation
				statement={statement}
				shouldDisplayScore={shouldDisplayScore}
			/>
		);
	} catch (error) {
		console.error(error);

		return null;
	}
};

export default Evaluation;
