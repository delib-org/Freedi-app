import { FC } from 'react';
import { PopperHebbianScore } from '@/models/popperHebbian/ScoreModels';
import { getScoreInterpretation } from '../../popperHebbianHelpers';
import styles from './IdeaScoreboard.module.scss';

interface IdeaScoreboardProps {
	score: PopperHebbianScore;
}

const IdeaScoreboard: FC<IdeaScoreboardProps> = ({ score }) => {
	const { totalScore, status } = score;

	const getStatusText = (status: string): string => {
		switch (status) {
			case 'looking-good':
				return 'Looking Good';
			case 'under-discussion':
				return 'Under Discussion';
			case 'needs-fixing':
				return 'Needs Improvement';
			default:
				return 'Under Discussion';
		}
	};

	const getStatusIcon = (status: string): string => {
		switch (status) {
			case 'looking-good':
				return '✓';
			case 'under-discussion':
				return '↔';
			case 'needs-fixing':
				return '!';
			default:
				return '↔';
		}
	};

	return (
		<div className={`${styles.scoreboard} ${styles[`scoreboard--${status}`]}`}>
			<div className={styles.scoreboardHeader}>
				<div className={styles.statusBadge}>
					<span className={styles.statusIcon}>{getStatusIcon(status)}</span>
					<span className={styles.statusText}>{getStatusText(status)}</span>
				</div>
			</div>

			<div className={styles.scoreboardBody}>
				<div className={styles.scoreDisplay}>
					<div className={styles.scoreValue}>
						{totalScore > 0 ? '+' : ''}
						{totalScore.toFixed(1)}
					</div>
					<div className={styles.scoreLabel}>Overall Score</div>
				</div>

				<div className={styles.scoreInterpretation}>
					{getScoreInterpretation(totalScore)}
				</div>
			</div>

			<div className={styles.scoreboardFooter}>
				<div className={styles.scoreBar}>
					<div
						className={styles.scoreBarFill}
						style={{
							width: `${Math.min(Math.abs(totalScore) * 10, 100)}%`,
							transform: totalScore < 0 ? 'scaleX(-1)' : 'none'
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default IdeaScoreboard;
