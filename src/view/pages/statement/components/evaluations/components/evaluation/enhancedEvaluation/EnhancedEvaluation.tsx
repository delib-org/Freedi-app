import { FC } from 'react';
import { getEvaluationThumbIdByScore } from '../../../statementsEvaluationCont';
import styles from './EnhancedEvaluation.module.scss';
import {
	enhancedEvaluationsThumbs,
	EnhancedEvaluationThumb,
} from './EnhancedEvaluationModel';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { Statement } from 'delib-npm';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';
import { CustomTooltip } from '@/view/components/tooltip/CustomTooltip';

interface EnhancedEvaluationProps {
	statement: Statement;
	shouldDisplayScore: boolean;
}

const EnhancedEvaluation: FC<EnhancedEvaluationProps> = ({
	statement,
	shouldDisplayScore,
}) => {
	const { t, learning } = useUserConfig();
	const evaluationScore = useAppSelector(
		evaluationSelector(statement.statementId)
	);
	const { consensus: _consensus } = statement;
	const { sumPro, sumCon, numberOfEvaluators } = statement.evaluation || {
		sumPro: 0,
		sumCon: 0,
		numberOfEvaluators: 0,
	};
	const avg = Math.round(((sumPro - sumCon) / numberOfEvaluators) * 100) / 100;
	const consensus = Math.round(_consensus * 100) / 100;

	return (
		<div className={styles['enhanced-evaluation']}>
			<div className={styles['evaluation-thumbs']}>
				{enhancedEvaluationsThumbs.map((evaluationThumb) => (
					<EvaluationThumb
						key={evaluationThumb.id}
						evaluationThumb={evaluationThumb}
						evaluationScore={evaluationScore}
						statement={statement}
					/>
				))}
			</div>
			<div
				className={`${styles['evaluation-score']} ${statement.consensus < 0 ? styles.negative : ''}`}
			>
				{shouldDisplayScore && (
					<CustomTooltip content={t("Average score")} position="top">
						<span className={styles.scoreValue}>{avg}</span>
					</CustomTooltip>
				)}

				{shouldDisplayScore && (
					<CustomTooltip content={t("Consensus score")} position="top">
						<span className={styles.scoreValue}>{consensus}</span>
					</CustomTooltip>
				)}

				{shouldDisplayScore &&
					numberOfEvaluators &&
					numberOfEvaluators > 0 ? (
					<CustomTooltip content={t("Number of evaluators")} position="bottom">
						<span className={styles['total-evaluators']}>
							{' '}({numberOfEvaluators})
						</span>
					</CustomTooltip>
				) : null}
			</div>
			<div />
			<div className={styles.explain}>
				{learning.evaluation > 0 && (
					<div className={`${styles['evaluation-explain']}`}>
						<span>{t('Disagree')}</span>
						<span>{t('Agree')}</span>
					</div>
				)}
			</div>
			<div />
		</div>
	);
};

export default EnhancedEvaluation;

export interface EvaluationThumbProps {
	statement: Statement;
	evaluationScore: number | undefined;
	evaluationThumb: EnhancedEvaluationThumb;
}

export const EvaluationThumb: FC<EvaluationThumbProps> = ({
	evaluationThumb,
	evaluationScore,
	statement,
}) => {
	const { creator } = useAuthentication();
	const decreaseLearning = useDecreaseLearningRemain();

	const handleSetEvaluation = (): void => {
		setEvaluationToDB(statement, creator, evaluationThumb.evaluation);
		decreaseLearning({
			evaluation: true,
		});
	};

	const isThumbActive =
		evaluationScore !== undefined &&
		evaluationThumb.id === getEvaluationThumbIdByScore(evaluationScore);

	return (
		<button
			className={`${styles['evaluation-thumb']} ${isThumbActive ? styles.active : ''}`}
			style={{
				backgroundColor: isThumbActive
					? evaluationThumb.colorSelected
					: evaluationThumb.color,
			}}
			onClick={handleSetEvaluation}
		>
			<img src={evaluationThumb.svg} alt={evaluationThumb.alt} />
		</button>
	);
};
