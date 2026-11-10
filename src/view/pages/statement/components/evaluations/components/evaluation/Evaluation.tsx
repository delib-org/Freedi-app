import { FC, ReactNode } from 'react';
import EnhancedEvaluation from './enhancedEvaluation/EnhancedEvaluation';
import SimpleEvaluation from './simpleEvaluation/SimpleEvaluation';
import SingleLikeEvaluation from './singleLikeEvaluation/SingleLikeEvaluation';
import CommunityVoiceEvaluation from './communityVoiceEvaluation/CommunityVoiceEvaluation';
import { Statement } from '@freedi/shared-types';
import { useEvaluation } from './EvalautionMV';
import { logError } from '@/utils/errorHandling';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import { useCardAnswerScoreGate } from '../../../questionScreen/useAnswerScoreGate';

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
	/** With `compact`: the host's action buttons. The range scale renders them
	 *  between the faces and the result chips, so the DOM order is the visual
	 *  order (faces, actions, chips); every other type, and every early exit,
	 *  renders them after the evaluation. They always render. */
	footerSlot?: ReactNode;
}

const Evaluation: FC<EvaluationProps> = ({
	statement,
	variant = 'default',
	hideFaceLabels = false,
	compact = false,
	footerSlot,
}) => {
	const { parentStatement } = useEvaluation(statement);
	const { isHalted } = useIsProcessHalted(parentStatement);
	const scoreGate = useCardAnswerScoreGate(statement, parentStatement);

	if (!statement) return <>{footerSlot}</>;
	try {
		if (!parentStatement) return <>{footerSlot}</>;

		const isSelectionFunction = !!statement.evaluation?.selectionFunction;
		const shouldDisplayScore = scoreGate.canSee && !isSelectionFunction;
		const showRevealHint = scoreGate.showRevealHint && !isSelectionFunction;

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
						<>
							<SingleLikeEvaluation
								statement={statement}
								parentStatement={parentStatement}
								shouldDisplayScore={shouldDisplayScore}
								showRevealHint={showRevealHint}
								enableEvaluation={enableEvaluation}
								variant={variant}
							/>
							{footerSlot}
						</>
					);
				case 'range':
					return (
						<EnhancedEvaluation
							statement={statement}
							enableEvaluation={enableEvaluation}
							variant={variant}
							hideFaceLabels={hideFaceLabels}
							compact={compact}
							footerSlot={footerSlot}
						/>
					);
				case 'community-voice':
					return (
						<>
							<CommunityVoiceEvaluation
								statement={statement}
								enableEvaluation={enableEvaluation}
								variant={variant}
							/>
							{footerSlot}
						</>
					);
				case 'like-dislike':
				default:
					return (
						<>
							<SimpleEvaluation
								statement={statement}
								shouldDisplayScore={shouldDisplayScore}
								showRevealHint={showRevealHint}
								enableEvaluation={enableEvaluation}
								variant={variant}
							/>
							{footerSlot}
						</>
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
					footerSlot={footerSlot}
				/>
			);
		}

		return (
			<>
				<SimpleEvaluation
					statement={statement}
					shouldDisplayScore={shouldDisplayScore}
					showRevealHint={showRevealHint}
					enableEvaluation={enableEvaluation}
					variant={variant}
				/>
				{footerSlot}
			</>
		);
	} catch (error) {
		logError(error, { operation: 'evaluation.Evaluation.unknown' });

		return <>{footerSlot}</>;
	}
};

export default Evaluation;
