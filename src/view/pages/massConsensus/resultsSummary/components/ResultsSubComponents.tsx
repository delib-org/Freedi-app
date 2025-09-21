import React, { FC } from 'react';
import { Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './ResultsSubComponents.module.scss';
import evaluation1 from "@/assets/icons/evaluation/evaluation1.svg";
import evaluation5 from "@/assets/icons/evaluation/evaluation5.svg";

interface Props {
	statement: Statement;
	totalParticipants: number;
}

const ResultsSubComponents: FC<Props> = ({ statement, totalParticipants }) => {
	const { t } = useUserConfig();

	const participants = statement.evaluation?.numberOfEvaluators || 0;
	const supportCount = statement.evaluation?.sumPro || 0;
	const againstCount = Math.abs(statement.evaluation?.sumCon || 0);

	// Calculate agreement score using (pro-con)/n formula
	const agreementScore = participants > 0
		? Math.round(((supportCount - againstCount) / participants) * 100)
		: 0;

	// Calculate opacity based on participation rate (0.3 minimum for visibility, 1.0 maximum)
	const participationOpacity = totalParticipants > 0
		? Math.max(0.3, Math.min(1, participants / totalParticipants))
		: 1;

	// Calculate opacity for support badge (based on support strength relative to participants)
	// Use lower minimum (0.15) when value is 0, otherwise 0.35 minimum
	const supportOpacity = participants > 0
		? supportCount === 0 ? 0.15 : Math.max(0.35, Math.min(1, supportCount / participants))
		: 0.15;

	// Calculate opacity for against badge (based on against strength relative to participants)
	// Use lower minimum (0.15) when value is 0, otherwise 0.35 minimum
	const againstOpacity = participants > 0
		? againstCount === 0 ? 0.15 : Math.max(0.35, Math.min(1, againstCount / participants))
		: 0.15;

	return (
		<div className={styles.resultsSubComponents}>
			<div className={styles.metrics}>
				{/* Left side - Participation rate */}
				<div className={styles.participationRate}>
					<span
						className={styles.label}
						style={{
							direction: 'ltr',
							color: agreementScore < 0 ? 'var(--reject)' : 'inherit'
						}}
					>
						{agreementScore}%
					</span>
					<span className={styles.sublabel}>{t('Consensus score')}</span>
				</div>

				{/* Right side - Metrics badges */}
				<div className={styles.badges}>
					{/* Participants badge - Yellow with dynamic opacity */}
					<div className={`${styles.badge} ${styles['badge--participants']}`}>
						<span className={styles.badge__label}>{t('Voted')}</span>
						<span
							className={styles.badge__value}
						>
							<span
								style={{
									position: 'absolute',
									inset: 0,
									backgroundColor: 'var(--option)',
									opacity: participationOpacity,
									borderRadius: '1rem'
								}}
							/>
							<span className={styles.badge__number}>{participants}</span>
						</span>
					</div>

					{/* Support badge - Blue with icon in white circle */}
					<div className={`${styles.badge} ${styles['badge--support']}`}>
						<span className={styles.badge__label}>{t('Support')}</span>
						<div
							className={styles.badge__iconValue}
						>
							{/* Colored background layer with dynamic opacity */}
							<span
								className={styles.badge__background}
								style={{
									position: 'absolute',
									inset: 0,
									backgroundColor: 'var(--approve)',
									opacity: supportOpacity,
									borderRadius: '2rem'
								}}
							/>
							{/* White circle container for icon - always fully opaque */}
							<div className={styles.badge__iconContainer}>
								<img src={evaluation1} alt="support" className={styles.badge__icon} />
							</div>
							{/* Dark text for visibility on all opacity levels */}
							<span className={styles.badge__value}>{supportCount.toFixed(1)}</span>
						</div>
					</div>

					{/* Against badge - Red with icon in white circle */}
					<div className={`${styles.badge} ${styles['badge--against']}`}>
						<span className={styles.badge__label}>{t('Against')}</span>
						<div
							className={styles.badge__iconValue}
						>
							{/* Colored background layer with dynamic opacity */}
							<span
								className={styles.badge__background}
								style={{
									position: 'absolute',
									inset: 0,
									backgroundColor: 'var(--reject)',
									opacity: againstOpacity,
									borderRadius: '2rem'
								}}
							/>
							{/* White circle container for icon - always fully opaque */}
							<div className={styles.badge__iconContainer}>
								<img src={evaluation5} alt="against" className={styles.badge__icon} />
							</div>
							{/* Dark text for visibility on all opacity levels */}
							<span className={styles.badge__value}>{againstCount.toFixed(1)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ResultsSubComponents;