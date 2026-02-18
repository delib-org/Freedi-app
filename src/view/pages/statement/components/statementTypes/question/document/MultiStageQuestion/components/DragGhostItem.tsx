import React, { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import StageCard from '../../stages/StageCard';
import styles from '../MultiStageQuestion.module.scss';

interface DragGhostItemProps {
	draggedItem: {
		index: number;
		y: number;
	};
	stage: Statement;
}

export const DragGhostItem: FC<DragGhostItemProps> = ({ draggedItem, stage }) => {
	return (
		<div
			className={styles.ghostItem}
			style={{
				top: `${draggedItem.y}px`,
				position: 'absolute',
				transform: 'translateX(-20%)',
				opacity: 0.5,
				pointerEvents: 'none',
			}}
		>
			<StageCard statement={stage} />
		</div>
	);
};
