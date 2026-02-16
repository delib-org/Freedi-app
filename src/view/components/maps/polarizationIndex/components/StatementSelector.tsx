import React from 'react';
import type { PolarizationStatement } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface StatementSelectorProps {
	polarizationIndexes: PolarizationStatement[];
	selectedStatementIndex: number;
	onStatementSelect: (index: number) => void;
}

export const StatementSelector: React.FC<StatementSelectorProps> = ({
	polarizationIndexes,
	selectedStatementIndex,
	onStatementSelect,
}) => {
	return (
		<div className={styles.statementSelector}>
			{polarizationIndexes.map((statement, index) => (
				<button
					key={statement.statementId || index}
					onClick={() => onStatementSelect(index)}
					className={`${styles.statementButton} ${selectedStatementIndex === index ? styles.statementButtonActive : ''}`}
					style={{
						backgroundColor:
							selectedStatementIndex === index ? statement.color || '#3182ce' : undefined,
						borderColor: statement.color || '#e2e8f0',
					}}
				>
					<div className={styles.statementButtonTitle}>
						{statement.statementId || `Statement ${index + 1}`}
					</div>
					<div className={styles.statementButtonText}>
						{statement.statement || 'No description available'}
					</div>
				</button>
			))}
		</div>
	);
};
