import React from 'react';
import type { PolarizationGroup } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface GroupDetailsProps {
	selectedGroupData: PolarizationGroup | null;
}

export const GroupDetails: React.FC<GroupDetailsProps> = ({ selectedGroupData }) => {
	if (!selectedGroupData) return null;

	return (
		<div className={styles.selectedGroupCard}>
			<h3 className={styles.selectedGroupTitle}>
				Selected Group: {selectedGroupData.groupName || 'Unknown Group'}
			</h3>
			<div className={styles.selectedGroupGrid}>
				<div>
					<strong>Average Opinion:</strong> {(selectedGroupData.average || 0).toFixed(3)}
				</div>
				<div>
					<strong>Members:</strong> {selectedGroupData.numberOfMembers || 0}
				</div>
				<div>
					<strong>Internal MAD:</strong> {(selectedGroupData.mad || 0).toFixed(3)}
				</div>
				<div>
					<strong>Color:</strong>
					<span
						className={styles.colorBadge}
						style={{ backgroundColor: selectedGroupData.color || '#666' }}
					>
						{selectedGroupData.color || '#666'}
					</span>
				</div>
			</div>
		</div>
	);
};
