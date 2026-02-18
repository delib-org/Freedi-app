import React from 'react';
import type { PolarizationStatement, PolarizationAxis } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface StatsPanelProps {
	currentStatementData: PolarizationStatement;
	currentAxis: PolarizationAxis;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ currentStatementData, currentAxis }) => {
	return (
		<div className={styles.statsGrid}>
			{/* Overall Stats */}
			<div className={styles.statsCard}>
				<h3 className={styles.statsCardTitle}>Selected Statement Metrics</h3>
				<div className={styles.statsContent}>
					<div>
						<strong>Statement:</strong> {currentStatementData.statementId || 'Unknown'}
					</div>
					<div>
						<strong>Total Evaluators:</strong> {currentStatementData.totalEvaluators || 0}
					</div>
					<div>
						<strong>Average Agreement:</strong>{' '}
						{(currentStatementData.averageAgreement || 0).toFixed(3)}
					</div>
					<div>
						<strong>Polarization (MAD):</strong> {(currentStatementData.overallMAD || 0).toFixed(3)}
					</div>
					<div>
						<strong>Last Updated:</strong>{' '}
						{currentStatementData.lastUpdated
							? new Date(currentStatementData.lastUpdated).toLocaleString()
							: 'Unknown'}
					</div>
				</div>
			</div>

			{/* Current Axis Stats */}
			<div className={styles.axisStatsCard}>
				<h3 className={styles.axisStatsTitle}>
					{currentAxis.groupingQuestionText || 'Current Grouping'}
				</h3>
				<div className={styles.statsContent}>
					<div>
						<strong>Axis Average:</strong> {(currentAxis.axisAverageAgreement || 0).toFixed(3)}
					</div>
					<div>
						<strong>Axis MAD:</strong> {(currentAxis.axisMAD || 0).toFixed(3)}
					</div>
					<div>
						<strong>Groups:</strong> {currentAxis.groups?.length || 0}
					</div>
					<div>
						<strong>Total Members:</strong>{' '}
						{currentAxis.groups?.reduce((sum: number, g) => sum + (g.numberOfMembers || 0), 0) || 0}
					</div>
				</div>
			</div>
		</div>
	);
};
