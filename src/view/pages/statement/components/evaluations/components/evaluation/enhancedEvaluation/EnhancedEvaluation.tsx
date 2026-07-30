import { FC, useEffect, useState, useCallback } from 'react';
import { getEvaluationThumbIdByScore } from '../../../statementsEvaluationCont';
import styles from './EnhancedEvaluation.module.scss';
import {
	enhancedEvaluationsThumbs,
	reactionEvaluationsThumbs,
	EnhancedEvaluationThumb,
} from './EnhancedEvaluationModel';
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
import { ResultsStrip } from '@/view/components/atomic/molecules/ResultsStrip';

interface EnhancedEvaluationProps {
	statement: Statement;
	enableEvaluation?: boolean;
}

const EnhancedEvaluation: FC<EnhancedEvaluationProps> = ({
	statement,
	enableEvaluation = true,
}) => {
	const { t, learning } = useUserConfig();

	// Get parent statement for settings
	const parentStatement = useSelector(statementSelectorById(statement.parentId));
	const showEvaluation = parentStatement?.statementSettings?.showEvaluation;

	// Cross-app evaluation mode: reactions (positive 0..1 emoji) or the default
	// agree-disagree thumbs. Read from the same shared statementSettings.ratingMode.
	const ratingMode = parentStatement?.statementSettings?.ratingMode;
	const thumbs = ratingMode === 'reactions' ? reactionEvaluationsThumbs : enhancedEvaluationsThumbs;

	const evaluationScore = useAppSelector(evaluationSelector(statement.statementId));
	const [optimisticScore, setOptimisticScore] = useState<number | undefined>(evaluationScore);

	useEffect(() => {
		setOptimisticScore(evaluationScore);
	}, [evaluationScore]);

	const activeThumbId = getEvaluationThumbIdByScore(optimisticScore, thumbs);

	const handleEvaluate = useCallback((score: number) => {
		setOptimisticScore(score);
	}, []);

	return (
		<div className={`${styles.evaluation}`}>
			<div className={styles['enhanced-evaluation']}>
				{/* Faces and their end labels are one unit, sized to the faces. If the
				    labels are a sibling of the row instead, they stretch to the width
				    of the whole card and "Disagree"/"Agree" drift away from the ends
				    of the scale they name. */}
				<div className={styles.scale}>
					<div className={styles['evaluation-thumbs']}>
						{thumbs.map((evaluationThumb) => (
							<EvaluationThumb
								key={evaluationThumb.id}
								evaluationThumb={evaluationThumb}
								isActive={evaluationThumb.id === activeThumbId}
								statement={statement}
								enableEvaluation={enableEvaluation}
								onEvaluate={handleEvaluate}
							/>
						))}
					</div>
					{learning.evaluation > 0 && (
						<div className={styles['evaluation-explain']}>
							<span>{t('Disagree')}</span>
							<span>{t('Agree')}</span>
						</div>
					)}
				</div>
				{/* The three result numbers, spelled out. They used to live only in
				    a hover tooltip on a colour bar, so touch users never saw them. */}
				{showEvaluation && <ResultsStrip statement={statement} />}
			</div>
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
}

export const EvaluationThumb: FC<EvaluationThumbProps> = ({
	evaluationThumb,
	isActive,
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

	const isThumbActive = isActive;

	const button = (
		<button
			className={`${styles['evaluation-thumb']} ${isThumbActive ? styles.active : ''} ${!enableEvaluation ? styles.disabled : ''}`}
			style={
				!enableEvaluation && isThumbActive
					? { opacity: 1, filter: 'none', transform: 'scale(1.2)' }
					: undefined
			}
			onClick={enableEvaluation ? handleSetEvaluation : undefined}
			disabled={!enableEvaluation}
			aria-disabled={!enableEvaluation}
			aria-label={enableEvaluation ? t(evaluationThumb.alt) : t('Voting disabled - view only')}
		>
			{/* The coloured disc is a child, not the button itself. The button is
			    a transparent 44px hit target (WCAG 2.5.5); if the fill and its ring
			    were painted on the button, growing the target would grow the face
			    into a large hollow circle with the glyph adrift inside it. */}
			<span
				className={styles['evaluation-thumb__face']}
				style={{
					backgroundColor: isThumbActive ? evaluationThumb.colorSelected : evaluationThumb.color,
				}}
			>
				{evaluationThumb.emoji ? (
					<span className={styles['evaluation-thumb__emoji']} aria-hidden="true">
						{evaluationThumb.emoji}
					</span>
				) : (
					<img src={evaluationThumb.svg} alt={evaluationThumb.alt} />
				)}
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
