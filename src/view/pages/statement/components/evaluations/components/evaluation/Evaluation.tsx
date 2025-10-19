import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import SingleLikeEvaluation from './singleLikeEvaluation/SingleLikeEvaluation';
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

		// Check for evaluationType first, then fall back to enhancedEvaluation for backward compatibility
		const evaluationType = parentStatement.statementSettings?.evaluationType;
		const enhancedEvaluation = parentStatement.statementSettings?.enhancedEvaluation;

		// Handle evaluation type routing
		if (evaluationType) {
			switch (evaluationType) {
				case 'single-like':
					return (
						<SingleLikeEvaluation
							statement={statement}
							shouldDisplayScore={shouldDisplayScore}
						/>
					);
				case 'range':
					return (
						<EnhancedEvaluation
							statement={statement}
						/>
					);
				case 'like-dislike':
				default:
					return (
						<SimpleEvaluation
							statement={statement}
							shouldDisplayScore={shouldDisplayScore}
						/>
					);
			}
		}

		// Backward compatibility: if no evaluationType, use enhancedEvaluation boolean
		if (enhancedEvaluation) {
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
