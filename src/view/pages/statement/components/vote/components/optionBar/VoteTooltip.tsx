import { FC } from 'react';
import styles from './VoteTooltip.module.scss';

interface VoteTooltipProps {
	votes: number;
	percentage: number;
	isVisible: boolean;
}

export const VoteTooltip: FC<VoteTooltipProps> = ({ votes, percentage, isVisible }) => {
	if (!isVisible) return null;

	return (
		<div className={styles.tooltip}>
			<div className={styles.content}>
				<span className={styles.votes}>{votes} {votes === 1 ? 'vote' : 'votes'}</span>
				<span className={styles.percentage}>({percentage}%)</span>
			</div>
			<div className={styles.arrow} />
		</div>
	);
};

export default VoteTooltip;