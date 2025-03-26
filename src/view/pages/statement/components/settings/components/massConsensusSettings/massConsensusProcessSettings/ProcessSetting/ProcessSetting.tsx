import React, { useState, useRef } from 'react';
import styles from './ProcessSettings.module.scss'
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { MassConsensusPageUrls } from 'delib-npm';
import { reorderMassConsensusProcessToDB } from '@/controllers/db/massConsensus/setMassConsensus';
import { useParams } from 'react-router';

interface Props {
	processName: string;
	steps: MassConsensusPageUrls[];
}

const ProcessSetting = ({ processName, steps: _steps }: Props) => {
	const { statementId } = useParams();
	const [steps, setSteps] = useState<MassConsensusPageUrls[]>(_steps || defaultMassConsensusProcess);

	const dragItem = useRef<number | null>(null);
	const dragOverItem = useRef<number | null>(null);

	const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
		dragItem.current = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
	};

	const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
		dragOverItem.current = index;
	};

	const handleDragEnd = () => {
		if (dragItem.current !== null && dragOverItem.current !== null) {
			const newStepsOrder = [...steps];
			const draggedItemContent = newStepsOrder[dragItem.current];
			newStepsOrder.splice(dragItem.current, 1);
			newStepsOrder.splice(dragOverItem.current, 0, draggedItemContent);
			dragItem.current = null;
			dragOverItem.current = null;
			setSteps(newStepsOrder);

			if (statementId)
				reorderMassConsensusProcessToDB({ steps: newStepsOrder, statementId: statementId });
		}
	};

	return (
		<div className={styles['process-setting']}>
			<h4>{processName}</h4>
			{steps.map((process, index) => (
				<div
					key={index}
					draggable
					onDragStart={(e) => handleDragStart(e, index)}
					onDragEnter={(e) => handleDragEnter(e, index)}
					onDragEnd={handleDragEnd}
					className={styles['process-item']}
				>
					{index + 1}: {process}
				</div>
			))}
		</div>
	);
};

export default ProcessSetting;