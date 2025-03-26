import React, { useState, useRef } from 'react';
import styles from './ProcessSettings.module.scss'
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { LoginType, MassConsensusPageUrls } from 'delib-npm';
import { reorderMassConsensusProcessToDB } from '@/controllers/db/massConsensus/setMassConsensus';
import { useParams } from 'react-router';

const ProcessSetting = () => {
	const { statementId } = useParams();
	const [processList, setProcessList] = useState<MassConsensusPageUrls[]>(defaultMassConsensusProcess);

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
			const newList = [...processList];
			const draggedItemContent = newList[dragItem.current];
			newList.splice(dragItem.current, 1);
			newList.splice(dragOverItem.current, 0, draggedItemContent);
			dragItem.current = null;
			dragOverItem.current = null;
			setProcessList(newList);

			if (statementId)
				reorderMassConsensusProcessToDB({ processList: newList, statementId: statementId });
		}
	};

	return (
		<div className={styles['process-setting']}>
			{processList.map((process, index) => (
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