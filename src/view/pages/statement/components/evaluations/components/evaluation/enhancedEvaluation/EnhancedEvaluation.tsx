import { FC, useRef, useEffect, useState, useCallback } from 'react';
import { getEvaluationThumbIdByScore } from '../../../statementsEvaluationCont';
import styles from './EnhancedEvaluation.module.scss';
import { enhancedEvaluationsThumbs, EnhancedEvaluationThumb } from './EnhancedEvaluationModel';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { Statement } from '@freedi/shared-types';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';
import { Tooltip } from '@/view/components/tooltip/Tooltip';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';

interface EnhancedEvaluationProps {
	statement: Statement;
	enableEvaluation?: boolean;
}

const indicatorWidth = 32; // Width of the bar in pixels, used for calculations

const EnhancedEvaluation: FC<EnhancedEvaluationProps> = ({
	statement,
	enableEvaluation = true,
}) => {
	const { t, learning, dir } = useUserConfig();
	const [barWidth, setBarWidth] = useState<number>(0);

	// Get parent statement for settings
	const parentStatement = useSelector(statementSelectorById(statement.parentId));
	const evaluationBarRef = useRef<HTMLDivElement>(null);
	const showEvaluation = parentStatement?.statementSettings?.showEvaluation;
	const totalEvaluators = parentStatement?.evaluation?.asParentTotalEvaluators || 0;

	const evaluationScore = useAppSelector(evaluationSelector(statement.statementId));
	const [optimisticScore, setOptimisticScore] = useState<number | undefined>(evaluationScore);

	useEffect(() => {
		setOptimisticScore(evaluationScore);
	}, [evaluationScore]);

	const handleEvaluate = useCallback((score: number) => {
		setOptimisticScore(score);
	}, []);

	const { consensus: _consensus } = statement;
	const { sumPro, sumCon, numberOfEvaluators } = statement.evaluation || {
		sumPro: 0,
		sumCon: 0,
		numberOfEvaluators: 0,
	};
	const avg =
		numberOfEvaluators !== 0 ? Math.round(((sumPro - sumCon) / numberOfEvaluators) * 100) / 100 : 0;
	const consensus = Math.round(_consensus * 100) / 100;

	useEffect(() => {
		if (evaluationBarRef.current) {
			const width = evaluationBarRef.current.offsetWidth;
			setBarWidth(width);
		}
	}, []);

	function barPosition(width: number, avg: number): number {
		const normalizedPosition = ((avg + 1) / 2) * ((width - indicatorWidth) / width) * width;

		if (dir === 'ltr') {
			return width - indicatorWidth - normalizedPosition;
		}

		return normalizedPosition;
	}

	function barColor(avg: number): string {
		const colors = enhancedEvaluationsThumbs.map((thumb) => thumb.colorSelected);
		const index = Math.round((1 - (avg + 1) / 2) * (colors.length - 1));

		return colors[index] || colors[0];
	}

	return (
		<div className={`${styles.evaluation}`}>
			<div className={styles['enhanced-evaluation']}>
				<div className={styles['evaluation-thumbs']}>
					{enhancedEvaluationsThumbs.map((evaluationThumb) => (
						<EvaluationThumb
							key={evaluationThumb.id}
							evaluationThumb={evaluationThumb}
							optimisticScore={optimisticScore}
							statement={statement}
							enableEvaluation={enableEvaluation}
							onEvaluate={handleEvaluate}
						/>
					))}
				</div>
				{showEvaluation && (
					<Tooltip content={`${t('Average score')}: ${avg}`} position="top">
						<div className={styles['evaluation-bar']} ref={evaluationBarRef}>
							<div
								className={styles['evaluation-bar__indicator']}
								style={{
									width: `${indicatorWidth}px`,
									right: `${barPosition(barWidth, avg)}px`,
									backgroundColor: barColor(avg),
								}}
							></div>
						</div>
					</Tooltip>
				)}
				{learning.evaluation > 0 && (
					<div className={styles.explain}>
						<div className={`${styles['evaluation-explain']}`}>
							<span>{t('Disagree')}</span>
							<span>{t('Agree')}</span>
						</div>
					</div>
				)}
			</div>
			<div
				className={`${styles['evaluation-score']} ${statement.consensus < 0 ? styles.negative : ''}`}
			>
				{showEvaluation && totalEvaluators && numberOfEvaluators && numberOfEvaluators > 0 ? (
					<Tooltip
						content={`${t('Number of evaluators for this option / all evaluators')}. ${t('Consensus')}: ${consensus}${
							statement.evaluation?.agreementIndex !== undefined
								? `. ${t('Agreement Index')}: ${Math.round(statement.evaluation.agreementIndex * 100)}%`
								: ''
						}${
							statement.evaluation?.confidenceIndex !== undefined
								? `. ${t('Confidence Index')}: ${Math.round(statement.evaluation.confidenceIndex * 100)}%`
								: ''
						}`}
						position="bottom"
					>
						<span className={styles['total-evaluators']}>
							{' '}
							({numberOfEvaluators}/{totalEvaluators})
						</span>
					</Tooltip>
				) : null}
			</div>

			<div />
		</div>
	);
};

export default EnhancedEvaluation;

export interface EvaluationThumbProps {
	statement: Statement;
	optimisticScore: number | undefined;
	evaluationThumb: EnhancedEvaluationThumb;
	enableEvaluation?: boolean;
	onEvaluate: (score: number) => void;
}

export const EvaluationThumb: FC<EvaluationThumbProps> = ({
	evaluationThumb,
	optimisticScore,
	statement,
	enableEvaluation = true,
	onEvaluate,
}) => {
	const { creator } = useAuthentication();
	const { t } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	const handleSetEvaluation = (): void => {
		onEvaluate(evaluationThumb.evaluation);

		setEvaluationToDB(statement, creator, evaluationThumb.evaluation);

		decreaseLearning({
			evaluation: true,
		});
	};

	const isThumbActive =
		optimisticScore !== undefined &&
		evaluationThumb.id === getEvaluationThumbIdByScore(optimisticScore);

	const button = (
		<button
			className={`${styles['evaluation-thumb']} ${isThumbActive ? styles.active : ''} ${!enableEvaluation ? styles.disabled : ''}`}
			style={{
				backgroundColor: isThumbActive ? evaluationThumb.colorSelected : evaluationThumb.color,
				...(!enableEvaluation && isThumbActive
					? { opacity: 1, filter: 'none', transform: 'scale(1.2)' }
					: {}),
			}}
			onClick={enableEvaluation ? handleSetEvaluation : undefined}
			disabled={!enableEvaluation}
			aria-disabled={!enableEvaluation}
			aria-label={enableEvaluation ? evaluationThumb.alt : t('Voting disabled - view only')}
		>
			<img src={evaluationThumb.svg} alt={evaluationThumb.alt} />
		</button>
	);

	if (!enableEvaluation) {
		return (
			<Tooltip content={t('Voting is currently disabled by the moderator')} position="top">
				{button}
			</Tooltip>
		);
	}

	return button;
};
