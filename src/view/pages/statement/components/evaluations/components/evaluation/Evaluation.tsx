import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import { Statement } from 'delib-npm';
import { useEvaluation } from './EvalautionMV';

interface EvaluationProps {
	statement?: Statement;
	isMobile?: boolean;
}

const Evaluation: FC<EvaluationProps> = ({ statement, isMobile = false }) => {
	const { parentStatement } = useEvaluation(statement);

	if (!statement) return null;
	try {
		if (!parentStatement) return null;
		let shouldDisplayScore: boolean =
			!!parentStatement.statementSettings?.showEvaluation;
		if (statement.evaluation?.selectionFunction || isMobile)
			shouldDisplayScore = false;

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
