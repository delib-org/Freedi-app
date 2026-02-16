import React from 'react';
import type { PolarizationAxis } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface AxisSelectorProps {
	axes: PolarizationAxis[];
	selectedAxis: number;
	onAxisSelect: (index: number) => void;
}

export const AxisSelector: React.FC<AxisSelectorProps> = ({ axes, selectedAxis, onAxisSelect }) => {
	return (
		<div className={styles.axisSelector}>
			{axes.map((axis, index) => (
				<button
					key={axis.groupingQuestionId || index}
					onClick={() => onAxisSelect(index)}
					className={`${styles.axisButton} ${selectedAxis === index ? styles.axisButtonActive : ''}`}
				>
					{axis.groupingQuestionText || `Grouping ${index + 1}`}
				</button>
			))}
		</div>
	);
};
