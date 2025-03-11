import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import { Statement } from 'delib-npm';
import { useEvaluation } from './EvalautionMV';

interface EvaluationProps {
	statement: Statement;
}

const Evaluation: FC<EvaluationProps> = ({ statement }) => {
	try {
		const { parentStatement } = useEvaluation(statement);
		if (!parentStatement) return null;

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
