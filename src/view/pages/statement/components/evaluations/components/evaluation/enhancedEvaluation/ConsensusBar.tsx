import { FC } from 'react';
import clsx from 'clsx';
import styles from './EnhancedEvaluation.module.scss';
import {
	getConsensusBarPercent,
	getScoreBand,
	getScoreTone,
	SCORE_BAND_LABEL_KEYS,
} from './scoreBand';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const PERCENT = 100;

interface ConsensusBarProps {
	/** Consensus score, -1…1. */
	consensus: number;
}

/** "Group agreement" line: a worded reading of the score and a bar under it. */
const ConsensusBar: FC<ConsensusBarProps> = ({ consensus }) => {
	const { t } = useUserConfig();
	const tone = getScoreTone(consensus);
	const label = t(SCORE_BAND_LABEL_KEYS[getScoreBand(consensus)]);
	const title = t('Group agreement');

	return (
		<div className={styles.consensus} data-testid="consensus-bar">
			<div className={styles['consensus__head']}>
				<span>{title}</span>
				<span className={clsx(styles['consensus__label'], styles[`consensus__label--${tone}`])}>
					{label}
				</span>
			</div>
			<div
				className={styles['consensus__track']}
				role="meter"
				aria-label={title}
				aria-valuemin={-PERCENT}
				aria-valuemax={PERCENT}
				aria-valuenow={Math.round(consensus * PERCENT)}
				aria-valuetext={label}
			>
				<div
					className={clsx(styles['consensus__fill'], styles[`consensus__fill--${tone}`])}
					style={{ inlineSize: `${getConsensusBarPercent(consensus)}%` }}
				/>
			</div>
		</div>
	);
};

export default ConsensusBar;
