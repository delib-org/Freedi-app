import { FC } from 'react';
import { PopperHebbianScore, HEBBIAN_CONFIG } from '@/models/popperHebbian/ScoreModels';
import { getScoreInterpretation } from '../../popperHebbianHelpers';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './IdeaScoreboard.module.scss';

interface IdeaScoreboardProps {
	score: PopperHebbianScore;
}

const IdeaScoreboard: FC<IdeaScoreboardProps> = ({ score }) => {
	const { t } = useTranslation();
	// Use hebbianScore, fallback to corroborationLevel for backward compatibility
	const hebbianScore = score.hebbianScore ?? score.corroborationLevel ?? HEBBIAN_CONFIG.PRIOR;
	const { status } = score;

	const getStatusText = (status: string): string => {
		switch (status) {
			case 'looking-good':
				return t('Looking Good');
			case 'under-discussion':
				return t('Under Discussion');
			case 'needs-fixing':
				return t('Needs Improvement');
			default:
				return t('Under Discussion');
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

	// Convert 0-1 score to percentage for display
	const scorePercentage = Math.round(hebbianScore * 100);
	const thresholdPercentage = HEBBIAN_CONFIG.THRESHOLD * 100;

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
					<div className={styles.scoreValue}>{scorePercentage}%</div>
					<div className={styles.scoreLabel}>{t('Validity Score')}</div>
				</div>

				<div className={styles.scoreInterpretation}>{getScoreInterpretation(hebbianScore, t)}</div>
			</div>

			<div className={styles.scoreboardFooter}>
				<div className={styles.scoreBar}>
					<div className={styles.scoreBarFill} style={{ width: `${scorePercentage}%` }} />
					{/* Threshold marker at 60% */}
					<div className={styles.thresholdMarker} style={{ left: `${thresholdPercentage}%` }} />
				</div>
				<div className={styles.scoreBarLabels}>
					<span>0%</span>
					<span className={styles.thresholdLabel}>{thresholdPercentage}%</span>
					<span>100%</span>
				</div>
			</div>
		</div>
	);
};

export default IdeaScoreboard;
