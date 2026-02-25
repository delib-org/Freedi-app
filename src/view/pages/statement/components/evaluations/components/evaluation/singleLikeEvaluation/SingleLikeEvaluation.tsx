import { FC, useEffect, useState } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	evaluationSelector,
	userVotesInParentSelector,
} from '@/redux/evaluations/evaluationsSlice';
import { Statement, User } from '@freedi/shared-types';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { auth } from '@/controllers/db/config';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SingleLikeEvaluation.module.scss';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';
import EvaluationManagementModal from '@/view/components/evaluationManagement/EvaluationManagementModal';
import Snackbar from '@/view/components/snackbar/Snackbar';
import { Tooltip } from '@/view/components/tooltip/Tooltip';
import { logError } from '@/utils/errorHandling';
import { getPseudoName } from '@/utils/temporalNameGenerator';

interface Props {
	statement: Statement;
	parentStatement?: Statement;
	shouldDisplayScore?: boolean;
	enableEvaluation?: boolean;
}

const SingleLikeEvaluation: FC<Props> = ({
	statement,
	parentStatement,
	shouldDisplayScore = true,
	enableEvaluation = true,
}) => {
	const { t } = useTranslation();

	// Get initial values from statement
	// Use parent's total evaluators if available, otherwise fall back to statement's count
	const _totalEvaluators =
		parentStatement?.evaluation?.asParentTotalEvaluators ||
		parentStatement?.totalEvaluators ||
		statement.evaluation?.numberOfEvaluators ||
		0;
	const _likesCount = statement.evaluation?.sumPro || statement.pro || 0;

	const [likesCount, setLikesCount] = useState(_likesCount);
	const [totalEvaluators, setTotalEvaluators] = useState(_totalEvaluators);
	const [isProcessing, setIsProcessing] = useState(false);
	const [showVoteModal, setShowVoteModal] = useState(false);
	const [showSnackbar, setShowSnackbar] = useState(false);

	const evaluation = useAppSelector(evaluationSelector(statement.statementId));

	const userVoteCount = useAppSelector(userVotesInParentSelector(parentStatement?.statementId));

	const isLiked = evaluation === 1;
	const maxVotes = parentStatement?.evaluationSettings?.maxVotesPerUser;
	const hasVoteLimit = maxVotes && maxVotes > 0;
	const isAtVoteLimit = hasVoteLimit && userVoteCount >= maxVotes;

	useEffect(() => {
		// Update counts when statement or parent changes
		const newLikesCount = statement.evaluation?.sumPro || statement.pro || 0;
		// Use parent's total evaluators if available
		const newTotalEvaluators =
			parentStatement?.evaluation?.asParentTotalEvaluators ||
			parentStatement?.totalEvaluators ||
			statement.evaluation?.numberOfEvaluators ||
			0;

		setLikesCount(newLikesCount);
		setTotalEvaluators(newTotalEvaluators);
	}, [
		statement.evaluation?.sumPro,
		statement.evaluation?.numberOfEvaluators,
		statement.pro,
		parentStatement?.evaluation?.asParentTotalEvaluators,
		parentStatement?.totalEvaluators,
	]);

	const handleLikeToggle = async () => {
		if (isProcessing) return;

		const user = auth.currentUser;
		if (!user) return;

		// Check if trying to like when at vote limit
		if (!isLiked && isAtVoteLimit) {
			setShowVoteModal(true);

			return;
		}

		const creator: User = {
			displayName: user.displayName || getPseudoName(user.uid),
			email: user.email || '',
			photoURL: user.photoURL || '',
			uid: user.uid,
		};

		setIsProcessing(true);

		try {
			const newEvaluation = isLiked ? 0 : 1;

			// Optimistic update - only update likes, not total evaluators
			// (total evaluators comes from parent and is managed by Firebase)
			if (newEvaluation === 1) {
				setLikesCount((prev) => prev + 1);
			} else {
				setLikesCount((prev) => Math.max(0, prev - 1));
			}

			await setEvaluationToDB(statement, creator, newEvaluation);

			// Show vote count snackbar after successful vote
			if (hasVoteLimit) {
				setShowSnackbar(true);
			}
		} catch (error) {
			logError(error, {
				operation: 'singleLikeEvaluation.SingleLikeEvaluation.unknown',
				metadata: { message: 'Error setting evaluation:' },
			});
			// Rollback on error
			const rollbackLikes = statement.evaluation?.sumPro || statement.pro || 0;
			const rollbackEvaluators =
				parentStatement?.evaluation?.asParentTotalEvaluators ||
				parentStatement?.totalEvaluators ||
				statement.evaluation?.numberOfEvaluators ||
				0;
			setLikesCount(rollbackLikes);
			setTotalEvaluators(rollbackEvaluators);
		} finally {
			setIsProcessing(false);
		}
	};

	const likePercentage = totalEvaluators > 0 ? Math.round((likesCount / totalEvaluators) * 100) : 0;

	const likeButton = (
		<button
			className={`${styles.likeButton} ${isLiked ? styles.liked : ''} ${isProcessing ? styles.processing : ''} ${!enableEvaluation ? styles.disabled : ''}`}
			onClick={enableEvaluation ? handleLikeToggle : undefined}
			aria-label={
				enableEvaluation
					? isLiked
						? 'Unlike this suggestion'
						: 'Like this suggestion'
					: t('Voting disabled - view only')
			}
			aria-pressed={isLiked}
			aria-disabled={!enableEvaluation}
			disabled={isProcessing || !enableEvaluation}
		>
			<LikeIcon className={styles.likeIcon} />
		</button>
	);

	return (
		<div className={styles.singleLikeEvaluation}>
			{!enableEvaluation ? (
				<Tooltip content={t('Voting is currently disabled by the moderator')} position="top">
					{likeButton}
				</Tooltip>
			) : (
				likeButton
			)}

			{shouldDisplayScore && (
				<div className={styles.stats}>
					<span className={styles.count}>
						{likesCount} {likesCount === 1 ? 'like' : 'likes'}
					</span>
					{totalEvaluators > 0 && <span className={styles.percentage}>({likePercentage}%)</span>}
				</div>
			)}

			{shouldDisplayScore && totalEvaluators > 10 && (
				<div className={styles.progressBar}>
					<div
						className={styles.progressFill}
						style={{ width: `${likePercentage}%` }}
						aria-label={`${likePercentage}% of users liked this`}
					/>
				</div>
			)}

			{/* Evaluation Management Modal */}
			{showVoteModal && parentStatement && (
				<EvaluationManagementModal
					parentStatement={parentStatement}
					maxVotes={maxVotes || 0}
					onClose={() => {
						setShowVoteModal(false);
					}}
					onVoteRemoved={() => {
						setShowVoteModal(false);
						// Show snackbar after removing a vote
						setShowSnackbar(true);
					}}
				/>
			)}

			{/* Snackbar for vote count */}
			{hasVoteLimit && (
				<Snackbar
					message={`${userVoteCount}/${maxVotes} ${t('votes used')}`}
					subMessage={
						isAtVoteLimit
							? t("You've reached the maximum of") + ` ${maxVotes} ${t('votes')}`
							: undefined
					}
					isVisible={showSnackbar}
					duration={5000}
					onClose={() => setShowSnackbar(false)}
					type={isAtVoteLimit ? 'warning' : 'info'}
				/>
			)}
		</div>
	);
};

export default SingleLikeEvaluation;
