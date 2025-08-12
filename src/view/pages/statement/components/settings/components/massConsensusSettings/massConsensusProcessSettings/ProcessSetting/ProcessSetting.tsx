import React, { useState, useRef, useEffect } from 'react';
import styles from './ProcessSettings.module.scss'
import { defaultMassConsensusProcess, isNewStepFormat, convertLegacyStepsToNew } from '@/model/massConsensus/massConsensusModel';
import { LoginType, MassConsensusPageUrls, MassConsensusStep } from 'delib-npm';
import { removeMassConsensusStep, reorderMassConsensusProcessToDB } from '@/controllers/db/massConsensus/setMassConsensus';
import { useParams } from 'react-router';
import DeleteIcon from '@/assets/icons/delete.svg?react';

interface Props {
	processName: string;
	steps: MassConsensusStep[] | MassConsensusPageUrls[];
	loginType: LoginType;
}

const ProcessSetting = ({ processName, steps: _steps, loginType }: Props) => {
	const { statementId } = useParams();

	// Convert to new format if needed
	const initialSteps = isNewStepFormat(_steps) 
		? _steps 
		: convertLegacyStepsToNew(_steps as MassConsensusPageUrls[], statementId || '');
	
	const [steps, setSteps] = useState<MassConsensusStep[]>(initialSteps || defaultMassConsensusProcess);

	useEffect(() => {
		const convertedSteps = isNewStepFormat(_steps)
			? _steps
			: convertLegacyStepsToNew(_steps as MassConsensusPageUrls[], statementId || '');
		setSteps(convertedSteps);
	}, [_steps, statementId])

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
				reorderMassConsensusProcessToDB({ steps: newStepsOrder, statementId, loginType });
		}
	};

	function handleDelete(step: MassConsensusStep) {
		removeMassConsensusStep(statementId, loginType, step.screen);
	}

	return (
		<div className={styles['process-setting']}>
			<h4>{processName}</h4>
			{steps && steps.map((step, index) => (
				<div
					key={`${loginType}-${index}`}
					draggable
					onDragStart={(e) => handleDragStart(e, index)}
					onDragEnter={(e) => handleDragEnter(e, index)}
					onDragEnd={handleDragEnd}
					className={styles['process-item']}
				>
					{index + 1}: {step.screen}
					<button onClick={() => handleDelete(step)}><DeleteIcon /></button>
				</div>
			))}
		</div>
	);
};

export default ProcessSetting;