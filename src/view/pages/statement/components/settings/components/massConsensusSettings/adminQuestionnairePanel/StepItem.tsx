import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MassConsensusStep, LoginType } from 'delib-npm';
import { removeMassConsensusStep } from '@/controllers/db/massConsensus/setMassConsensus';
import { useParams } from 'react-router';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import styles from './StepItem.module.scss';

interface Props {
	id: string;
	step: MassConsensusStep;
	index: number;
	questionId: string;
	loginType: LoginType;
}

const StepItem: React.FC<Props> = ({ id, step, index, questionId, loginType }) => {
	const { statementId } = useParams();
	
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ 
		id,
		data: {
			questionId,
			step
		}
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const handleDelete = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (statementId) {
			removeMassConsensusStep(statementId, loginType, step);
		}
	};

	const getStepDisplayName = (screen: string | undefined): string => {
		if (!screen) return 'Unknown Step';

		return screen
			.split('-')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`${styles.stepItem} ${isDragging ? styles['stepItem--dragging'] : ''}`}
		>
			<div 
				className={styles.dragHandle}
				{...attributes}
				{...listeners}
			>
				<span className={styles.dragIcon}>⋮⋮</span>
			</div>
			
			<div className={styles.content}>
				<span className={styles.index}>{index + 1}:</span>
				<span className={styles.name}>
					{getStepDisplayName(step.screen)}
				</span>
				{step.text && (
					<span className={styles.text}>- {step.text}</span>
				)}
			</div>

			<button 
				className={styles.deleteBtn}
				onClick={handleDelete}
				aria-label="Delete step"
			>
				<DeleteIcon />
			</button>
		</div>
	);
};

export default StepItem;