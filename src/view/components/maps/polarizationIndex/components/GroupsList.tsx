import React from 'react';
import type { PolarizationGroup } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface GroupsListProps {
	groups: PolarizationGroup[] | undefined;
	selectedGroup: number | null;
	onGroupSelect: (index: number | null) => void;
}

export const GroupsList: React.FC<GroupsListProps> = ({ groups, selectedGroup, onGroupSelect }) => {
	if (!groups || groups.length === 0) return null;

	return (
		<div className={styles.groupsListContainer}>
			<h3 className={styles.groupsListTitle}>Groups in Current Axis</h3>
			<div className={styles.groupsGrid}>
				{groups.map((group, index) => (
					<div
						key={group.groupId || index}
						onClick={() => onGroupSelect(selectedGroup === index ? null : index)}
						className={`${styles.groupCard} ${selectedGroup === index ? styles.groupCardSelected : ''}`}
						style={{
							borderColor: selectedGroup === index ? group.color || '#666' : undefined,
							backgroundColor: selectedGroup === index ? `${group.color || '#666'}15` : undefined,
						}}
					>
						<div className={styles.groupCardHeader}>
							<div
								className={styles.groupColorDot}
								style={{ backgroundColor: group.color || '#666' }}
							/>
							<strong>{group.groupName || `Group ${index + 1}`}</strong>
						</div>
						<div className={styles.groupCardContent}>
							<div>Average: {(group.average || 0).toFixed(3)}</div>
							<div>Members: {group.numberOfMembers || 0}</div>
							<div>MAD: {(group.mad || 0).toFixed(3)}</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
