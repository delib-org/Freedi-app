import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { ClusterAggregatedEvaluation, Statement } from '@freedi/shared-types';
import styles from './ClusteringAdmin.module.scss';

interface ClusterCardProps {
	aggregation: ClusterAggregatedEvaluation;
	cluster?: Statement;
}

const ClusterCard: FC<ClusterCardProps> = ({ aggregation, cluster }) => {
	const { t } = useTranslation();

	// Calculate percentages for the visual bar
	const total =
		aggregation.proEvaluatorCount +
		aggregation.conEvaluatorCount +
		aggregation.neutralEvaluatorCount;

	const proPercent = total > 0 ? (aggregation.proEvaluatorCount / total) * 100 : 0;
	const conPercent = total > 0 ? (aggregation.conEvaluatorCount / total) * 100 : 0;
	const neutralPercent = total > 0 ? (aggregation.neutralEvaluatorCount / total) * 100 : 0;

	// Format the consensus score
	const consensusClass =
		aggregation.averageClusterConsensus > 0
			? styles.positive
			: aggregation.averageClusterConsensus < 0
				? styles.negative
				: styles.neutral;

	const title = cluster?.statement?.trim();
	// `description` is the cached, joined paragraph-children body, kept up to
	// date by `fn_syncParagraphChildrenToDescription`. We prefer it for the card
	// preview; fall back to `brief` for clusters summarized before the migration.
	const description = cluster?.description?.trim() || cluster?.brief?.trim();

	return (
		<div className={`${styles.clusterCard} ${aggregation.isStale ? styles.stale : ''}`}>
			<div className={styles.cardHeader}>
				<span className={styles.optionCount}>
					{aggregation.optionCount} {t('options')}
				</span>
				{aggregation.isStale && (
					<span className={styles.staleBadge} title={t('Data may be outdated')}>
						⚠
					</span>
				)}
			</div>

			{(title || description) && (
				<div className={styles.clusterMeta}>
					{title && <h5 className={styles.clusterTitle}>{title}</h5>}
					{description && <p className={styles.clusterBrief}>{description}</p>}
				</div>
			)}

			<div className={styles.cardBody}>
				{/* Unique Evaluators Count */}
				<div className={styles.mainStat}>
					<span className={styles.statNumber}>{aggregation.uniqueEvaluatorCount}</span>
					<span className={styles.statLabel}>{t('Unique Evaluators')}</span>
				</div>

				{/* Consensus Score */}
				<div className={`${styles.consensusScore} ${consensusClass}`}>
					<span className={styles.scoreValue}>
						{aggregation.averageClusterConsensus >= 0 ? '+' : ''}
						{aggregation.averageClusterConsensus.toFixed(1)}
					</span>
					<span className={styles.scoreLabel}>{t('Avg Score')}</span>
				</div>

				{/* Distribution Bar */}
				<div className={styles.distributionBar}>
					<div
						className={styles.proBar}
						style={{ width: `${proPercent}%` }}
						title={`${t('For')}: ${aggregation.proEvaluatorCount}`}
					/>
					<div
						className={styles.neutralBar}
						style={{ width: `${neutralPercent}%` }}
						title={`${t('Neutral')}: ${aggregation.neutralEvaluatorCount}`}
					/>
					<div
						className={styles.conBar}
						style={{ width: `${conPercent}%` }}
						title={`${t('Against')}: ${aggregation.conEvaluatorCount}`}
					/>
				</div>

				{/* Distribution Legend */}
				<div className={styles.distributionLegend}>
					<span className={styles.legendItem}>
						<span className={styles.proIcon} />
						{aggregation.proEvaluatorCount} {t('For')}
					</span>
					<span className={styles.legendItem}>
						<span className={styles.neutralIcon} />
						{aggregation.neutralEvaluatorCount} {t('Neutral')}
					</span>
					<span className={styles.legendItem}>
						<span className={styles.conIcon} />
						{aggregation.conEvaluatorCount} {t('Against')}
					</span>
				</div>
			</div>

			<div className={styles.cardFooter}>
				<span className={styles.lastUpdated}>
					{t('Updated')}: {new Date(aggregation.calculatedAt).toLocaleString()}
				</span>
			</div>
		</div>
	);
};

export default ClusterCard;
