import { CSSProperties, FC, ReactNode, useEffect, useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import styles from './EnhancedEvaluation.module.scss';
import {
	enhancedEvaluationsThumbs,
	reactionEvaluationsThumbs,
	EnhancedEvaluationThumb,
} from './EnhancedEvaluationModel';
import { buildFaceScale, FaceTone, shouldShowFaceLabels } from './faceScaleModel';
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
import { useCardAnswerScoreGate } from '../../../../questionScreen/useAnswerScoreGate';
import { ResultsStrip } from '@/view/components/atomic/molecules/ResultsStrip';
import { EvaluationCircle, EvaluationCircleRow } from '../shared/EvaluationCircle';
import { FaceIcon } from '@/view/components/atomic/atoms/FaceIcon';

export type EnhancedEvaluationVariant = 'default' | 'card';

interface EnhancedEvaluationProps {
	statement: Statement;
	enableEvaluation?: boolean;
	/** 'card' (answer card): hides the scale on your own answer and keeps the
	 *  results behind your own rating. 'default' keeps the old behaviour. */
	variant?: EnhancedEvaluationVariant;
	/** Chat surfaces: never show the visible text under the faces. The
	 *  aria-label stays. */
	hideFaceLabels?: boolean;
	/** Footer layout: round faces + compact chips, laid out as direct flex items
	 *  of the host's footer (`display: contents`) so the host's action buttons
	 *  can share the chips' row. Visibility rules stay those of `variant`. */
	compact?: boolean;
	/** The host's action buttons, rendered between the faces and the chips. */
	footerSlot?: ReactNode;
}

const EnhancedEvaluation: FC<EnhancedEvaluationProps> = ({
	statement,
	enableEvaluation = true,
	variant = 'default',
	hideFaceLabels = false,
	compact = false,
	footerSlot,
}) => {
	const { t } = useUserConfig();
	const { creator } = useAuthentication();

	// Get parent statement for settings
	const parentStatement = useSelector(statementSelectorById(statement.parentId));

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

	// Presses on this statement's faces, this session only. Re-taps count.
	const [pressCount, setPressCount] = useState(0);
	const showLabels = !hideFaceLabels && shouldShowFaceLabels(pressCount);

	const handleEvaluate = useCallback((score: number) => {
		setOptimisticScore(score);
		setPressCount((count) => count + 1);
	}, []);

	const isCard = variant === 'card';
	const isRound = isCard || compact;
	const hasRated = optimisticScore !== undefined;
	const isOwnAnswer = isCard && !!creator?.uid && statement.creatorId === creator.uid;
	// `hasRated` is the optimistic score, so the result opens on the tap itself.
	const { canSee: showResults, showRevealHint } = useCardAnswerScoreGate(
		statement,
		parentStatement,
		{
			hasRated,
		},
	);

	const thumbNodes = options.map((option) => (
		<EvaluationThumb
			key={option.thumb.id}
			evaluationThumb={option.thumb}
			isActive={option.isSelected}
			tone={option.tone}
			labelKey={option.labelKey}
			showLabel={showLabels}
			shape={isRound ? 'circle' : 'tile'}
			statement={statement}
			enableEvaluation={enableEvaluation}
			onEvaluate={handleEvaluate}
		/>
	));

	return (
		<div
			className={clsx(
				styles.evaluation,
				isCard && styles['evaluation--card'],
				compact && styles['evaluation--compact'],
			)}
		>
			{!isOwnAnswer &&
				(isRound ? (
					<div className={styles.evaluation__faces}>
						<EvaluationCircleRow
							hasSelection={hasRated}
							label={t('Rating scale')}
							testId="face-scale"
						>
							{thumbNodes}
						</EvaluationCircleRow>
					</div>
				) : (
					<div
						className={styles.scale}
						role="group"
						aria-label={t('Rating scale')}
						data-testid="face-scale"
					>
						{thumbNodes}
					</div>
				))}
			{footerSlot}
			{/* The result numbers, spelled out. They used to live only in a hover
			    tooltip on a colour bar, so touch users never saw them. On a card
			    they are Join's compact chips row. */}
			{showResults && (
				<ResultsStrip
					statement={statement}
					variant={isRound ? 'chips' : 'tiles'}
					inline={compact}
				/>
			)}
			{showRevealHint && (
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
	/** Render the visible text label. The aria-label is always kept. */
	showLabel?: boolean;
	/** 'circle' (answer card): a big filled face, no box and no text label. */
	shape?: 'tile' | 'circle';
}

export const EvaluationThumb: FC<EvaluationThumbProps> = ({
	evaluationThumb,
	isActive,
	statement,
	enableEvaluation = true,
	onEvaluate,
	tone,
	labelKey,
	showLabel = true,
	shape = 'tile',
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

	const isCircle = shape === 'circle';
	const glyph = evaluationThumb.emoji ? (
		<span className={styles['face__emoji']}>{evaluationThumb.emoji}</span>
	) : isCircle ? (
		<img src={evaluationThumb.svg} alt="" />
	) : evaluationThumb.face ? (
		<FaceIcon face={evaluationThumb.face} />
	) : (
		<img src={evaluationThumb.svg} alt="" />
	);

	const circleButton = (
		<EvaluationCircle
			color={evaluationThumb.colorSelected}
			isActive={isActive}
			disabled={!enableEvaluation}
			label={label}
			disabledLabel={`${label}. ${t('Voting disabled - view only')}`}
			onClick={handleSetEvaluation}
			testId={`face-scale-option-${evaluationThumb.id}`}
		>
			{glyph}
		</EvaluationCircle>
	);

	const button = isCircle ? (
		circleButton
	) : (
		<button
			type="button"
			className={clsx(
				styles.face,
				styles[`face--${effectiveTone}`],
				!showLabel && styles['face--compact'],
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
				{glyph}
			</span>
			{showLabel && (
				<span className={styles['face__label']} aria-hidden="true">
					{label}
				</span>
			)}
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
