import { FC } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import SingleLikeEvaluation from './singleLikeEvaluation/SingleLikeEvaluation';
import CommunityVoiceEvaluation from './communityVoiceEvaluation/CommunityVoiceEvaluation';
import { Statement } from '@freedi/shared-types';
import { useEvaluation } from './EvalautionMV';
import { logError } from '@/utils/errorHandling';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';

export type EvaluationVariant = 'default' | 'card';

interface EvaluationProps {
	statement?: Statement;
	/** 'card' = the answer card: no face scale on your own answer, and results
	 *  stay hidden until you have rated (range / enhanced scale only). */
	variant?: EvaluationVariant;
	/** Chat surfaces: no visible text under the range faces. */
	hideFaceLabels?: boolean;
	/** Footer layout (range / enhanced scale only): round faces and compact result
	 *  chips whose pieces flow into the host's flex footer, so the host can put
	 *  its action buttons on the same row as the chips. Other types ignore it. */
	compact?: boolean;
}

const Evaluation: FC<EvaluationProps> = ({
	statement,
	variant = 'default',
	hideFaceLabels = false,
	compact = false,
}) => {
	const { parentStatement } = useEvaluation(statement);
	const { isHalted } = useIsProcessHalted(parentStatement);

	if (!statement) return null;
	try {
		if (!parentStatement) return null;

		let shouldDisplayScore: boolean =
			!!parentStatement.statementSettings?.showEvaluation && window.innerWidth >= 768; //also checks for mobile
		if (statement.evaluation?.selectionFunction) shouldDisplayScore = false;

		// Check if evaluation is enabled (defaults to true for backward compatibility)
		const enableEvaluation =
			(parentStatement.statementSettings?.enableEvaluation ?? true) && !isHalted;

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
							variant={variant}
						/>
					);
				case 'range':
					return (
						<EnhancedEvaluation
							statement={statement}
							enableEvaluation={enableEvaluation}
							variant={variant}
							hideFaceLabels={hideFaceLabels}
							compact={compact}
						/>
					);
				case 'community-voice':
					return (
						<CommunityVoiceEvaluation
							statement={statement}
							enableEvaluation={enableEvaluation}
							variant={variant}
						/>
					);
				case 'like-dislike':
				default:
					return (
						<SimpleEvaluation
							statement={statement}
							shouldDisplayScore={shouldDisplayScore}
							enableEvaluation={enableEvaluation}
							variant={variant}
						/>
					);
			}
		}

		// Backward compatibility: if no evaluationType, use enhancedEvaluation boolean
		if (enhancedEvaluation) {
			return (
				<EnhancedEvaluation
					statement={statement}
					enableEvaluation={enableEvaluation}
					variant={variant}
					hideFaceLabels={hideFaceLabels}
					compact={compact}
				/>
			);
		}

		return (
			<SimpleEvaluation
				statement={statement}
				shouldDisplayScore={shouldDisplayScore}
				enableEvaluation={enableEvaluation}
				variant={variant}
			/>
		);
	} catch (error) {
		logError(error, { operation: 'evaluation.Evaluation.unknown' });

		return null;
	}
};

export default Evaluation;
