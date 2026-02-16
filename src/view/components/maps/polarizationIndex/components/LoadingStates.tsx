import React from 'react';
import styles from '../PolarizationIndex.module.scss';

export const LoadingState: React.FC = () => {
	return (
		<div className={styles.polarizationContainer}>
			<div className={styles.header}>
				<h1 className={styles.title}>Loading Polarization Analysis...</h1>
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						height: '200px',
						fontSize: '18px',
						color: '#666',
					}}
				>
					📊 Loading data...
				</div>
			</div>
		</div>
	);
};

interface NoDataStateProps {
	statementId?: string;
}

export const NoDataState: React.FC<NoDataStateProps> = ({ statementId }) => {
	return (
		<div className={styles.polarizationContainer}>
			<div className={styles.header}>
				<h1 className={styles.title}>No Polarization Data Available</h1>
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						height: '200px',
						fontSize: '18px',
						color: '#666',
					}}
				>
					📊 No polarization data found for statement ID: {statementId}
				</div>
			</div>
		</div>
	);
};
