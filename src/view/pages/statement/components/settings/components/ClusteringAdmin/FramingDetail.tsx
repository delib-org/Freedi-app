import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Framing, ClusterAggregatedEvaluation } from '@freedi/shared-types';
import styles from './ClusteringAdmin.module.scss';
import ClusterCard from './ClusterCard';
import Loader from '@/view/components/loaders/Loader';

interface FramingDetailProps {
	framing: Framing;
	aggregations: ClusterAggregatedEvaluation[];
	isLoading: boolean;
	onRefresh: () => void;
}

const FramingDetail: FC<FramingDetailProps> = ({
	framing,
	aggregations,
	isLoading,
	onRefresh,
}) => {
	const { t } = useTranslation();

	// Calculate summary stats
	const totalUniqueEvaluators = aggregations.reduce(
		(max, agg) => Math.max(max, agg.uniqueEvaluatorCount),
		0
	);

	const averageConsensus =
		aggregations.length > 0
			? aggregations.reduce((sum, agg) => sum + agg.averageClusterConsensus, 0) /
			  aggregations.length
			: 0;

	const hasStaleData = aggregations.some(agg => agg.isStale);

	return (
		<div className={styles.framingDetail}>
			<div className={styles.detailHeader}>
				<div className={styles.framingTitle}>
					<h4>{framing.name}</h4>
					{framing.description && (
						<p className={styles.framingDescription}>{framing.description}</p>
					)}
				</div>
				<button
					className={`btn btn--secondary ${styles.refreshBtn}`}
					onClick={onRefresh}
					disabled={isLoading}
					title={t('Refresh aggregations')}
				>
					{isLoading ? <Loader /> : '↻'}
				</button>
			</div>

			{/* Summary Stats */}
			<div className={styles.summaryStats}>
				<div className={styles.stat}>
					<span className={styles.statValue}>{aggregations.length}</span>
					<span className={styles.statLabel}>{t('Clusters')}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>{totalUniqueEvaluators}</span>
					<span className={styles.statLabel}>{t('Unique Evaluators')}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>
						{averageConsensus.toFixed(1)}%
					</span>
					<span className={styles.statLabel}>{t('Avg Consensus')}</span>
				</div>
				{hasStaleData && (
					<div className={styles.staleWarning}>
						<span className={styles.warningIcon}>⚠</span>
						<span>{t('Some data may be outdated')}</span>
					</div>
				)}
			</div>

			{/* Custom Prompt Display */}
			{framing.prompt && (
				<div className={styles.customPrompt}>
					<span className={styles.promptLabel}>{t('Custom Prompt')}:</span>
					<p className={styles.promptText}>{framing.prompt}</p>
				</div>
			)}

			{/* Cluster Cards */}
			<div className={styles.clusterGrid}>
				{isLoading && aggregations.length === 0 ? (
					<div className={styles.loaderContainer}>
						<Loader />
					</div>
				) : aggregations.length === 0 ? (
					<div className={styles.noAggregations}>
						<p>{t('No cluster data available yet')}</p>
					</div>
				) : (
					aggregations.map(aggregation => (
						<ClusterCard
							key={aggregation.clusterId}
							aggregation={aggregation}
						/>
					))
				)}
			</div>
		</div>
	);
};

export default FramingDetail;
