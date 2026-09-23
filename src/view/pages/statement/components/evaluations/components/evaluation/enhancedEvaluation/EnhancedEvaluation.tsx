import { CSSProperties, FC, useEffect, useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import styles from './EnhancedEvaluation.module.scss';
import {
	enhancedEvaluationsThumbs,
	reactionEvaluationsThumbs,
	EnhancedEvaluationThumb,
} from './EnhancedEvaluationModel';
import { buildFaceScale, FaceTone } from './faceScaleModel';
import ConsensusBar from './ConsensusBar';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { DEFAULT_MIN_EVALUATORS, Statement } from '@freedi/shared-types';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';
import { Tooltip } from '@/view/components/tooltip/Tooltip';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { ResultsStrip } from '@/view/components/atomic/molecules/ResultsStrip';
import { FaceIcon } from '@/view/components/atomic/atoms/FaceIcon';

export type EnhancedEvaluationVariant = 'default' | 'card';

interface EnhancedEvaluationProps {
	statement: Statement;
	enableEvaluation?: boolean;
	/** 'card' (answer card): hides the scale on your own answer and keeps the
	 *  results behind your own rating. 'default' keeps the old behaviour. */
	variant?: EnhancedEvaluationVariant;
}

const EnhancedEvaluation: FC<EnhancedEvaluationProps> = ({
	statement,
	enableEvaluation = true,
	variant = 'default',
}) => {
	const { t } = useUserConfig();
	const { creator } = useAuthentication();

	// Get parent statement for settings
	const parentStatement = useSelector(statementSelectorById(statement.parentId));
	const showEvaluation = !!parentStatement?.statementSettings?.showEvaluation;

	// Cross-app evaluation mode: reactions (positive 0..1 emoji) or the default
	// agree-disagree faces. Read from the same shared statementSettings.ratingMode.
	const ratingMode = parentStatement?.statementSettings?.ratingMode;
	const thumbs = ratingMode === 'reactions' ? reactionEvaluationsThumbs : enhancedEvaluationsThumbs;

	const evaluationScore = useAppSelector(evaluationSelector(statement.statementId));
	const [optimisticScore, setOptimisticScore] = useState<number | undefined>(evaluationScore);

	useEffect(() => {
		setOptimisticScore(evaluationScore);
	}, [evaluationScore]);

	// Explicit low→high order, selection and per-face tone live in the model.
	const options = useMemo(() => buildFaceScale(thumbs, optimisticScore), [thumbs, optimisticScore]);

	const handleEvaluate = useCallback((score: number) => {
		setOptimisticScore(score);
	}, []);

	const isCard = variant === 'card';
	const hasRated = optimisticScore !== undefined;
	const isOwnAnswer = isCard && !!creator?.uid && statement.creatorId === creator.uid;
	// On a card, results wait for your own rating so they cannot anchor it —
	// except where you cannot rate at all (your own answer, rating disabled).
	const resultsUnlocked = !isCard || isOwnAnswer || hasRated || !enableEvaluation;
	const numberOfEvaluators = statement.evaluation?.numberOfEvaluators ?? 0;
	const showResults = showEvaluation && resultsUnlocked;
	// The bar is a consensus reading, so it honours the same minimum-evaluator
	// gate as the consensus tile in the strip.
	const showConsensusBar = isCard && showResults && numberOfEvaluators >= DEFAULT_MIN_EVALUATORS;

	return (
		<div className={clsx(styles.evaluation, isCard && styles['evaluation--card'])}>
			{!isOwnAnswer && (
				<div
					className={styles.scale}
					role="group"
					aria-label={t('Rating scale')}
					data-testid="face-scale"
				>
					{options.map((option) => (
						<EvaluationThumb
							key={option.thumb.id}
							evaluationThumb={option.thumb}
							isActive={option.isSelected}
							tone={option.tone}
							labelKey={option.labelKey}
							statement={statement}
							enableEvaluation={enableEvaluation}
							onEvaluate={handleEvaluate}
						/>
					))}
				</div>
			)}
			{showConsensusBar && <ConsensusBar consensus={statement.consensus ?? 0} />}
			{/* The three result numbers, spelled out. They used to live only in
			    a hover tooltip on a colour bar, so touch users never saw them. */}
			{showResults && <ResultsStrip statement={statement} />}
			{showEvaluation && !resultsUnlocked && (
				<p className={styles['reveal-hint']} data-testid="results-reveal-hint">
					{t('The result will be revealed after you rate')}
				</p>
			)}
		</div>
	);
};

export default EnhancedEvaluation;

export interface EvaluationThumbProps {
	statement: Statement;
	isActive: boolean;
	evaluationThumb: EnhancedEvaluationThumb;
	enableEvaluation?: boolean;
	onEvaluate: (score: number) => void;
	/** Paint state from the face-scale model. Defaults from `isActive`. */
	tone?: FaceTone;
	/** Visible label key. Defaults to the thumb's label, then its alt. */
	labelKey?: string;
}

export const EvaluationThumb: FC<EvaluationThumbProps> = ({
	evaluationThumb,
	isActive,
	statement,
	enableEvaluation = true,
	onEvaluate,
	tone,
	labelKey,
}) => {
	const { creator } = useAuthentication();
	const { t } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	// Tapping the face you already chose writes the same value again (no
	// toggle-off) — unchanged from the previous thumbs.
	const handleSetEvaluation = (): void => {
		onEvaluate(evaluationThumb.evaluation);

		setEvaluationToDB(statement, creator, evaluationThumb.evaluation);

		decreaseLearning({
			evaluation: true,
		});
	};

	const effectiveTone: FaceTone = tone ?? (isActive ? 'selected' : 'own');
	const label = t(labelKey ?? evaluationThumb.label ?? evaluationThumb.alt);
	// The option's own ramp token drives border, fill and face colour.
	const faceStyle = { '--face-color': evaluationThumb.colorSelected } as CSSProperties;

	const button = (
		<button
			type="button"
			className={clsx(
				styles.face,
				styles[`face--${effectiveTone}`],
				!enableEvaluation && styles['face--disabled'],
			)}
			style={faceStyle}
			onClick={enableEvaluation ? handleSetEvaluation : undefined}
			disabled={!enableEvaluation}
			aria-disabled={!enableEvaluation}
			aria-pressed={isActive}
			aria-label={enableEvaluation ? label : `${label}. ${t('Voting disabled - view only')}`}
			data-testid={`face-scale-option-${evaluationThumb.id}`}
		>
			<span className={styles['face__glyph']} aria-hidden="true">
				{evaluationThumb.emoji ? (
					<span className={styles['face__emoji']}>{evaluationThumb.emoji}</span>
				) : evaluationThumb.face ? (
					<FaceIcon face={evaluationThumb.face} />
				) : (
					<img src={evaluationThumb.svg} alt="" />
				)}
			</span>
			<span className={styles['face__label']} aria-hidden="true">
				{label}
			</span>
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
