import React from 'react';
import type { PolarizationStatement } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface AllStatementsOverviewProps {
	polarizationIndexes: PolarizationStatement[];
	selectedStatementIndex: number;
	onStatementSelect: (index: number) => void;
}

export const AllStatementsOverview: React.FC<AllStatementsOverviewProps> = ({
	polarizationIndexes,
	selectedStatementIndex,
	onStatementSelect,
}) => {
	return (
		<div className={styles.groupsListContainer} style={{ marginTop: '20px' }}>
			<h3 className={styles.groupsListTitle}>All Statements Overview</h3>
			<div className={styles.groupsGrid}>
				{polarizationIndexes.map((statement, index) => (
					<div
						key={statement.statementId || index}
						onClick={() => onStatementSelect(index)}
						className={`${styles.groupCard} ${selectedStatementIndex === index ? styles.groupCardSelected : ''}`}
						style={{
							borderColor: statement.color || '#666',
							backgroundColor:
								selectedStatementIndex === index ? `${statement.color || '#666'}15` : undefined,
						}}
					>
						<div className={styles.groupCardHeader}>
							<div
								className={styles.groupColorDot}
								style={{ backgroundColor: statement.color || '#666' }}
							/>
							<strong>{statement.statementId || `Statement ${index + 1}`}</strong>
						</div>
						<div className={styles.groupCardContent}>
							<div style={{ marginBottom: '8px', fontSize: '13px', color: '#333' }}>
								{statement.statement || 'No description available'}
							</div>
							<div>
								<strong>Agreement:</strong> {(statement.averageAgreement || 0).toFixed(3)}
							</div>
							<div>
								<strong>Polarization:</strong> {(statement.overallMAD || 0).toFixed(3)}
							</div>
							<div>
								<strong>Evaluators:</strong> {statement.totalEvaluators || 0}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
