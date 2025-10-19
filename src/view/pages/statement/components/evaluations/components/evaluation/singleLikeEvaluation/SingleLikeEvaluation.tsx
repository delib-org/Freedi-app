import { FC, useEffect, useState } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { Statement, User } from 'delib-npm';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { auth } from '@/controllers/db/config';
import styles from './SingleLikeEvaluation.module.scss';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';

interface Props {
	statement: Statement;
	parentStatement?: Statement;
	shouldDisplayScore?: boolean;
}

const SingleLikeEvaluation: FC<Props> = ({
	statement,
	parentStatement,
	shouldDisplayScore = true,
}) => {
	// Get initial values from statement
	// Use parent's total evaluators if available, otherwise fall back to statement's count
	const _totalEvaluators = parentStatement?.evaluation?.asParentTotalEvaluators ||
							parentStatement?.totalEvaluators ||
							statement.evaluation?.numberOfEvaluators || 0;
	const _likesCount = statement.evaluation?.sumPro || statement.pro || 0;

	const [likesCount, setLikesCount] = useState(_likesCount);
	const [totalEvaluators, setTotalEvaluators] = useState(_totalEvaluators);
	const [isProcessing, setIsProcessing] = useState(false);

	const evaluation = useAppSelector(
		evaluationSelector(statement.statementId)
	);

	const isLiked = evaluation === 1;

	useEffect(() => {
		// Update counts when statement or parent changes
		const newLikesCount = statement.evaluation?.sumPro || statement.pro || 0;
		// Use parent's total evaluators if available
		const newTotalEvaluators = parentStatement?.evaluation?.asParentTotalEvaluators ||
								parentStatement?.totalEvaluators ||
								statement.evaluation?.numberOfEvaluators || 0;

		setLikesCount(newLikesCount);
		setTotalEvaluators(newTotalEvaluators);
	}, [
		statement.evaluation?.sumPro,
		statement.evaluation?.numberOfEvaluators,
		statement.pro,
		parentStatement?.evaluation?.asParentTotalEvaluators,
		parentStatement?.totalEvaluators
	]);

	const handleLikeToggle = async () => {
		if (isProcessing) return;

		const user = auth.currentUser;
		if (!user) return;

		const creator: User = {
			displayName: user.displayName || 'Anonymous',
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
				setLikesCount(prev => prev + 1);
			} else {
				setLikesCount(prev => Math.max(0, prev - 1));
			}

			await setEvaluationToDB(statement, creator, newEvaluation);
		} catch (error) {
			console.error('Error setting evaluation:', error);
			// Rollback on error
			const rollbackLikes = statement.evaluation?.sumPro || statement.pro || 0;
			const rollbackEvaluators = parentStatement?.evaluation?.asParentTotalEvaluators ||
									parentStatement?.totalEvaluators ||
									statement.evaluation?.numberOfEvaluators || 0;
			setLikesCount(rollbackLikes);
			setTotalEvaluators(rollbackEvaluators);
		} finally {
			setIsProcessing(false);
		}
	};

	const likePercentage = totalEvaluators > 0
		? Math.round((likesCount / totalEvaluators) * 100)
		: 0;

	return (
		<div className={styles.singleLikeEvaluation}>
			<button
				className={`${styles.likeButton} ${isLiked ? styles.liked : ''} ${isProcessing ? styles.processing : ''}`}
				onClick={handleLikeToggle}
				aria-label={isLiked ? 'Unlike this suggestion' : 'Like this suggestion'}
				aria-pressed={isLiked}
				disabled={isProcessing}
			>
				<LikeIcon className={styles.likeIcon} />
			</button>

			{shouldDisplayScore && (
				<div className={styles.stats}>
					<span className={styles.count}>
						{likesCount} {likesCount === 1 ? 'like' : 'likes'}
					</span>
					{totalEvaluators > 0 && (
						<span className={styles.percentage}>
							({likePercentage}%)
						</span>
					)}
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
		</div>
	);
};

export default SingleLikeEvaluation;