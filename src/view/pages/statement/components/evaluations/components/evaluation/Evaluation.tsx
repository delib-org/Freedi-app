import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import { Statement } from 'delib-npm';
import { useEvaluation } from './EvalautionMV';

interface EvaluationProps {
	statement?: Statement;
}

const Evaluation: FC<EvaluationProps> = ({ statement }) => {

	const { parentStatement } = useEvaluation(statement);

	if (!statement) return null;
	try {

		if (!parentStatement) return null;

		let shouldDisplayScore: boolean = !!parentStatement.statementSettings?.showEvaluation && window.innerWidth >= 768; //also checks for mobile
		if (statement.evaluation?.selectionFunction) shouldDisplayScore = false;

		if (parentStatement.statementSettings?.enhancedEvaluation) {
			return (
				<EnhancedEvaluation
					statement={statement}
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
