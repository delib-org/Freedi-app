import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import SingleLikeEvaluation from './singleLikeEvaluation/SingleLikeEvaluation';
import CommunityVoiceEvaluation from './communityVoiceEvaluation/CommunityVoiceEvaluation';
import { Statement } from '@freedi/shared-types';
import { useEvaluation } from './EvalautionMV';
import { logError } from '@/utils/errorHandling';

interface EvaluationProps {
	statement?: Statement;
}

const Evaluation: FC<EvaluationProps> = ({ statement }) => {
	const { parentStatement } = useEvaluation(statement);

	if (!statement) return null;
	try {
		if (!parentStatement) return null;

		let shouldDisplayScore: boolean =
			!!parentStatement.statementSettings?.showEvaluation && window.innerWidth >= 768; //also checks for mobile
		if (statement.evaluation?.selectionFunction) shouldDisplayScore = false;

		// Check if evaluation is enabled (defaults to true for backward compatibility)
		const enableEvaluation = parentStatement.statementSettings?.enableEvaluation ?? true;

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
							parentStatement={parentStatement}
							shouldDisplayScore={shouldDisplayScore}
							enableEvaluation={enableEvaluation}
						/>
					);
				case 'range':
					return <EnhancedEvaluation statement={statement} enableEvaluation={enableEvaluation} />;
				case 'community-voice':
					return (
						<CommunityVoiceEvaluation statement={statement} enableEvaluation={enableEvaluation} />
					);
				case 'like-dislike':
				default:
					return (
						<SimpleEvaluation
							statement={statement}
							shouldDisplayScore={shouldDisplayScore}
							enableEvaluation={enableEvaluation}
						/>
					);
			}
		}

		// Backward compatibility: if no evaluationType, use enhancedEvaluation boolean
		if (enhancedEvaluation) {
			return <EnhancedEvaluation statement={statement} enableEvaluation={enableEvaluation} />;
		}

		return (
			<SimpleEvaluation
				statement={statement}
				shouldDisplayScore={shouldDisplayScore}
				enableEvaluation={enableEvaluation}
			/>
		);
	} catch (error) {
		logError(error, { operation: 'evaluation.Evaluation.unknown' });

		return null;
	}
};

export default Evaluation;
