import React from 'react';
import styles from '../PolarizationIndex.module.scss';

export const Instructions: React.FC = () => {
	return (
		<div className={styles.instructions}>
			💡 <strong>How to use:</strong> All statement points are always visible on the chart. Click on
			any main point (large colored dots) to select a statement and view its groups. Use the
			grouping buttons to switch between different demographic breakdowns for the selected
			statement. Click on group dots to see detailed information.
		</div>
	);
};
