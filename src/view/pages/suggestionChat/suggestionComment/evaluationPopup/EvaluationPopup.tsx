import { findClosestEvaluation } from '@/controllers/general/helpers';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import EnhancedEvaluation, {
	EvaluationThumb,
} from '@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluation';
import {
	enhancedEvaluationsThumbs,
	EnhancedEvaluationThumb,
} from '@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel';
import SimpleEvaluation from '@/view/pages/statement/components/evaluations/components/evaluation/simpleEvaluation/SimpleEvaluation';
import SingleLikeEvaluation from '@/view/pages/statement/components/evaluations/components/evaluation/singleLikeEvaluation/SingleLikeEvaluation';
import { Statement, evaluationType } from '@freedi/shared-types';
import { FC, useState } from 'react';
import styles from './EvaluationPopup.module.scss';

interface Props {
	parentStatement: Statement;
}

const EvaluationPopup: FC<Props> = ({ parentStatement }) => {
	const evaluationScore = useAppSelector(evaluationSelector(parentStatement.statementId));

	const [showAllEvaluations, setShowAllEvaluations] = useState(false);

	// Determine evaluation type
	const currentEvaluationType = parentStatement.statementSettings?.evaluationType;
	const enhancedEvaluation = parentStatement.statementSettings?.enhancedEvaluation;

	// Get evaluation type with backward compatibility
	const getEvaluationType = (): evaluationType => {
		if (currentEvaluationType) {
			return currentEvaluationType;
		}
		// Backward compatibility

		return enhancedEvaluation ? evaluationType.range : evaluationType.likeDislike;
	};

	const evalType = getEvaluationType();

	// Handle single-like evaluation type
	if (evalType === evaluationType.singleLike) {
		return (
			<div className={styles['evaluation-popup']}>
				<div className={styles['evaluation-popup__single-like']}>
					<SingleLikeEvaluation statement={parentStatement} shouldDisplayScore={false} />
				</div>
			</div>
		);
	}

	// Handle like-dislike evaluation type
	if (evalType === evaluationType.likeDislike) {
		return (
			<div className={styles['evaluation-popup']}>
				<div className={styles['evaluation-popup__simple']}>
					<SimpleEvaluation statement={parentStatement} shouldDisplayScore={false} />
				</div>
			</div>
		);
	}

	// Handle range (enhanced) evaluation type
	const thumb: EnhancedEvaluationThumb = findClosestEvaluation(
		enhancedEvaluationsThumbs,
		evaluationScore,
	);

	return (
		<div className={styles['evaluation-popup']}>
			{!showAllEvaluations ? (
				<button
					onClick={() => setShowAllEvaluations(true)}
					className={styles['evaluation-popup__thumb']}
					style={{ backgroundColor: thumb.colorSelected }}
				>
					<EvaluationThumb
						statement={parentStatement}
						evaluationScore={evaluationScore}
						evaluationThumb={thumb}
					/>
				</button>
			) : (
				<button
					onClick={() => setShowAllEvaluations(false)}
					className={styles['evaluation-popup__thumbs']}
				>
					<EnhancedEvaluation statement={parentStatement} />
				</button>
			)}
		</div>
	);
};

export default EvaluationPopup;
