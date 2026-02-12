import { FC, useState, useEffect } from 'react';
import styles from './CommunityVoiceEvaluation.module.scss';
import {
	communityVoiceOptions,
	CommunityVoiceOption,
} from './CommunityVoiceEvaluationModel';
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

interface CommunityVoiceEvaluationProps {
	statement: Statement;
	enableEvaluation?: boolean;
}

interface EvaluationBarConfig {
	leftLabel: string;
	rightLabel: string;
}

const CommunityVoiceEvaluation: FC<CommunityVoiceEvaluationProps> = ({
	statement,
	enableEvaluation = true,
}) => {
	const { t, learning } = useUserConfig();

	const parentStatement = useSelector(
		statementSelectorById(statement.parentId)
	);
	const showEvaluation =
		parentStatement?.statementSettings?.showEvaluation;
	const totalEvaluators =
		parentStatement?.evaluation?.asParentTotalEvaluators || 0;

	const evaluationScore = useAppSelector(
		evaluationSelector(statement.statementId)
	);

	const { numberOfEvaluators } = statement.evaluation || {
		numberOfEvaluators: 0,
	};

	return (
		<div className={styles.evaluation}>
			<div className={styles['community-voice']}>
				<div className={styles['voice-options']}>
					{communityVoiceOptions.map((option) => (
						<VoiceOptionButton
							key={option.id}
							option={option}
							evaluationScore={evaluationScore}
							statement={statement}
							enableEvaluation={enableEvaluation}
							showLabels={learning.communityVoiceLabels > 0}
						/>
					))}
				</div>
			</div>
			<div className={styles['evaluation-score']}>
				{showEvaluation &&
				totalEvaluators &&
				numberOfEvaluators &&
				numberOfEvaluators > 0 ? (
					<Tooltip
						content={`${t('Number of evaluators for this option / all evaluators')}`}
						position='bottom'
					>
						<span className={styles['total-evaluators']}>
							({numberOfEvaluators}/{totalEvaluators})
						</span>
					</Tooltip>
				) : null}
			</div>
		</div>
	);
};

export default CommunityVoiceEvaluation;

interface VoiceOptionButtonProps {
	statement: Statement;
	evaluationScore: number | undefined;
	option: CommunityVoiceOption;
	enableEvaluation?: boolean;
	showLabels: boolean;
}

const VoiceOptionButton: FC<VoiceOptionButtonProps> = ({
	option,
	evaluationScore,
	statement,
	enableEvaluation = true,
	showLabels,
}) => {
	const { creator } = useAuthentication();
	const { t } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();
	const [isPending, setIsPending] = useState(false);
	const [optimisticScore, setOptimisticScore] = useState<
		number | undefined
	>(evaluationScore);

	useEffect(() => {
		setOptimisticScore(evaluationScore);
		setIsPending(false);
	}, [evaluationScore]);

	const isActive =
		optimisticScore !== undefined &&
		optimisticScore === option.evaluation;

	const handleSetEvaluation = (): void => {
		// Toggle: if already selected, deselect (set to 0), otherwise select
		const newScore = isActive ? 0 : option.evaluation;

		setOptimisticScore(newScore === 0 ? undefined : newScore);
		setIsPending(true);

		setEvaluationToDB(statement, creator, newScore).finally(
			() => {
				setIsPending(false);
			}
		);

		decreaseLearning({
			communityVoiceLabel: true,
		});
	};

	const button = (
		<div className={styles['voice-option-wrapper']}>
			<button
				className={`${styles['voice-option']} ${isActive ? styles.active : ''} ${isPending ? styles.pending : ''} ${!enableEvaluation ? styles.disabled : ''}`}
				onClick={enableEvaluation ? handleSetEvaluation : undefined}
				disabled={isPending || !enableEvaluation}
				aria-disabled={!enableEvaluation}
				aria-label={
					enableEvaluation
						? t(option.labelKey)
						: t('Voting disabled - view only')
				}
			>
				<img src={option.svg} alt={t(option.alt)} />
			</button>
			{showLabels && (
				<span className={styles['voice-label']}>
					{t(option.labelKey)}
				</span>
			)}
		</div>
	);

	if (!enableEvaluation) {
		return (
			<Tooltip
				content={t(
					'Voting is currently disabled by the moderator'
				)}
				position='top'
			>
				{button}
			</Tooltip>
		);
	}

	return button;
};
