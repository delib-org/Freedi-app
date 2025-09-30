import { Feedback } from 'delib-npm';
import styles from './FeedbackCard.module.scss';
import { FC } from 'react';

interface Props {
	feedback: Feedback;
}

const FeedbackCard: FC<Props> = ({ feedback }) => {
	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	return (
		<div className={styles.feedbackCard}>
			<div className={styles.feedbackHeader}>
				<div className={styles.userInfo}>
					<span className={styles.userName}>
						{feedback.creator.displayName || 'Anonymous'}
					</span>
					{feedback.email && (
						<a href={`mailto:${feedback.email}`} className={styles.userEmail}>
							{feedback.email}
						</a>
					)}
				</div>
				<span className={styles.date}>{formatDate(feedback.createdAt)}</span>
			</div>
			<div className={styles.feedbackText}>
				{feedback.feedbackText}
			</div>
		</div>
	);
};

export default FeedbackCard;