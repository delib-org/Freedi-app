import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import SingleLikeEvaluation from './singleLikeEvaluation/SingleLikeEvaluation';
import CommunityVoiceEvaluation from './communityVoiceEvaluation/CommunityVoiceEvaluation';
import { Statement } from '@freedi/shared-types';
import { useEvaluation } from './EvalautionMV';
import { logError } from '@/utils/errorHandling';

/** Common props accepted by all evaluation components in the registry */
interface CommonEvaluationProps {
	statement: Statement;
	parentStatement?: Statement;
	shouldDisplayScore?: boolean;
	enableEvaluation?: boolean;
}

/** Registry mapping evaluation type strings to their component implementations */
const EVALUATION_REGISTRY: Record<string, FC<CommonEvaluationProps>> = {
	'single-like': SingleLikeEvaluation,
	'range': EnhancedEvaluation as FC<CommonEvaluationProps>,
	'community-voice': CommunityVoiceEvaluation as FC<CommonEvaluationProps>,
	'like-dislike': SimpleEvaluation,
};

/** Default evaluation component when no type matches */
const DEFAULT_EVALUATION: FC<CommonEvaluationProps> = SimpleEvaluation;

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

		// Common props passed to all evaluation components
		const commonProps: CommonEvaluationProps = {
			statement,
			parentStatement,
			shouldDisplayScore,
			enableEvaluation,
		};

		// Handle evaluation type routing via registry
		if (evaluationType) {
			const EvalComponent = EVALUATION_REGISTRY[evaluationType] ?? DEFAULT_EVALUATION;

			return <EvalComponent {...commonProps} />;
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
