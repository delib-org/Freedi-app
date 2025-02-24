import { FC } from 'react';
import { getEvaluationThumbIdByScore } from '../../../statementsEvaluationCont';
import styles from './EnhancedEvaluation.module.scss';
import {
	enhancedEvaluationsThumbs,
	EnhancedEvaluationThumb,
} from './EnhancedEvaluationModel';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { decreesUserSettingsLearningRemain } from '@/controllers/db/learning/setLearning';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
// import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { Statement } from '@/types/statement/Statement';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

interface EnhancedEvaluationProps {
	statement: Statement;
	shouldDisplayScore: boolean;
}

const EnhancedEvaluation: FC<EnhancedEvaluationProps> = ({
	statement,
	shouldDisplayScore,
}) => {
	// const { t } = useUserConfig();
	const evaluationScore = useAppSelector(
		evaluationSelector(statement.statementId)
	);

	// const learningEvaluation =
	// 	useAppSelector(userSettingsSelector)?.learning?.evaluation || 0;

	const { sumPro, sumCon, numberOfEvaluators } = statement.evaluation || {
		sumPro: 0,
		sumCon: 0,
		numberOfEvaluators: 0,
	};

	return (
		<div className={styles['enhanced-evaluation']}>
			<div className={`${styles['evaluation-score']} con-element`}>
				{shouldDisplayScore === true ? sumCon : null}
			</div>
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
				className={`${styles['evaluation-score']} ${statement.consensus < 0 ? 'negative' : ''}`}
			>
				{shouldDisplayScore && <span>{sumPro}</span>}
				{shouldDisplayScore &&
				numberOfEvaluators &&
				numberOfEvaluators > 0 ? (
					<span className={styles['total-evaluators']}>
						{' '}
						({numberOfEvaluators})
					</span>
				) : null}
			</div>
			<div />
			<div className={styles.explain}>
				{/* {learningEvaluation > 0 && (
					<div className={`${styles['evaluation-explain']}`}>
						<span>{t('Disagree')}</span>
						<span>{t('Agree')}</span>
					</div>
				)} */}
			</div>
			<div />
		</div>
	);
};

export default EnhancedEvaluation;

interface EvaluationThumbProps {
	statement: Statement;
	evaluationScore: number | undefined;
	evaluationThumb: EnhancedEvaluationThumb;
}

const EvaluationThumb: FC<EvaluationThumbProps> = ({
	evaluationThumb,
	evaluationScore,
	statement,
}) => {
	const { creator } = useAuthentication();
	const handleSetEvaluation = (): void => {
		setEvaluationToDB(statement, creator, evaluationThumb.evaluation);
		decreesUserSettingsLearningRemain({
			userId: creator.uid,
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
