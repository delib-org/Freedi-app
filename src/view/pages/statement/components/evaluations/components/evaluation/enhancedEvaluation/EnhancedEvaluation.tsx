import { FC, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { getEvaluationThumbIdByScore } from '../../../statementsEvaluationCont';
import styles from './EnhancedEvaluation.module.scss';
import { enhancedEvaluationsThumbs, EnhancedEvaluationThumb } from './EnhancedEvaluationModel';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { Statement, calcMeanSentiment, calcAgreementIndex, DEFAULT_MIN_EVALUATORS } from '@freedi/shared-types';
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

	const evaluationScore = useAppSelector(evaluationSelector(statement.statementId));
	const [optimisticScore, setOptimisticScore] = useState<number | undefined>(evaluationScore);

	useEffect(() => {
		setOptimisticScore(evaluationScore);
	}, [evaluationScore]);

	const handleEvaluate = useCallback((score: number) => {
		setOptimisticScore(score);
	}, []);

	const { consensus: _consensus } = statement;
	const {
		sumPro,
		sumCon,
		numberOfEvaluators,
		sumEvaluations = 0,
		sumSquaredEvaluations = 0,
	} = statement.evaluation || {
		sumPro: 0,
		sumCon: 0,
		numberOfEvaluators: 0,
		sumEvaluations: 0,
		sumSquaredEvaluations: 0,
	};
	const avg =
		numberOfEvaluators !== 0 ? Math.round(((sumPro - sumCon) / numberOfEvaluators) * 100) / 100 : 0;
	const consensusDisplay = Math.round(_consensus * 100);

	const metrics = useMemo(() => {
		if (!numberOfEvaluators || numberOfEvaluators <= 0) return null;
		const meanSentiment = calcMeanSentiment(sumEvaluations, numberOfEvaluators);
		const agreementIndex = calcAgreementIndex(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

		return {
			meanSentiment: Math.round(meanSentiment * 100),
			agreementIndex: Math.round(agreementIndex * 100),
			consensusScore: consensusDisplay,
		};
	}, [sumEvaluations, sumSquaredEvaluations, numberOfEvaluators, consensusDisplay]);

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
					<Tooltip
						content={metrics ? (
							<>
								<div>{t('Average score')}: {metrics.meanSentiment}%</div>
								<div>{t('Agreement')}: {metrics.agreementIndex}%</div>
								<div>{t('Evaluators')}: {numberOfEvaluators}</div>
							</>
						) : `${t('Evaluators')}: 0`}
						position="top"
					>
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
				className={`${styles['evaluation-score']} ${consensusDisplay < 0 ? styles.negative : ''}`}
			>
				{showEvaluation && numberOfEvaluators >= DEFAULT_MIN_EVALUATORS ? (
					<Tooltip
						content={metrics ? (
							<>
								<div>{t('Consensus score')}: {metrics.consensusScore}</div>
								<div>{t('Average score')}: {metrics.meanSentiment}%</div>
								<div>{t('Agreement')}: {metrics.agreementIndex}%</div>
								<div>{t('Evaluators')}: {numberOfEvaluators}</div>
							</>
						) : `${t('Evaluators')}: ${numberOfEvaluators}`}
						position="bottom"
					>
						<span
							className={`${styles['consensus-score']} ${consensusDisplay < 0 ? styles['consensus-score--negative'] : ''}`}
						>
							{consensusDisplay}
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
