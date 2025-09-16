import React, { useState, useEffect } from 'react';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	DragEndEvent,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
	useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './ProcessSettings.module.scss';
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { LoginType, MassConsensusPageUrls, MassConsensusStep } from 'delib-npm';
import { removeMassConsensusStep, reorderMassConsensusProcessToDB } from '@/controllers/db/massConsensus/setMassConsensus';
import { useParams } from 'react-router';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import CloseIcon from '@/assets/icons/close.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	processName: string;
	steps: MassConsensusStep[];
	loginType: LoginType;
}

interface SortableItemProps {
	id: string;
	index: number;
	process: MassConsensusStep;
	onDelete: (screen: MassConsensusPageUrls) => void;
	t: (key: string) => string;
}

const SortableItem: React.FC<SortableItemProps> = ({
	id,
	index,
	process,
	onDelete,
	t
}) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		cursor: isDragging ? 'grabbing' : 'grab',
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={styles['process-item']}
		>
			<span className={styles['process-item__content']}>
				{index + 1}: {t(process.text || process.screen)}
			</span>
			<button
				onClick={(e) => {
					e.stopPropagation();
					onDelete(process.screen);
				}}
				className={styles['process-item__delete']}
				aria-label={`Delete ${process.text || process.screen}`}
			>
				<DeleteIcon />
			</button>
		</div>
	);
};

// Define all possible steps
const ALL_STEPS: MassConsensusPageUrls[] = [
	MassConsensusPageUrls.introduction,
	MassConsensusPageUrls.userDemographics,
	MassConsensusPageUrls.question,
	MassConsensusPageUrls.randomSuggestions,
	MassConsensusPageUrls.topSuggestions,
	MassConsensusPageUrls.mySuggestions,
	MassConsensusPageUrls.voting,
	MassConsensusPageUrls.leaveFeedback,
	MassConsensusPageUrls.thankYou,
];

// Map of step names for display
const STEP_DISPLAY_NAMES: Record<MassConsensusPageUrls, string> = {
	[MassConsensusPageUrls.introduction]: 'Introduction',
	[MassConsensusPageUrls.userDemographics]: 'User Demographics',
	[MassConsensusPageUrls.question]: 'Question',
	[MassConsensusPageUrls.randomSuggestions]: 'Random Suggestions',
	[MassConsensusPageUrls.topSuggestions]: 'Top Suggestions',
	[MassConsensusPageUrls.mySuggestions]: 'My Suggestions',
	[MassConsensusPageUrls.voting]: 'Voting',
	[MassConsensusPageUrls.leaveFeedback]: 'Leave Feedback',
	[MassConsensusPageUrls.thankYou]: 'Thank You',
	[MassConsensusPageUrls.initialQuestion]: 'Initial Question',
};

const ProcessSetting = ({ processName, steps: _steps, loginType }: Props) => {
	const { statementId } = useParams();
	const { t } = useUserConfig();

	const [steps, setSteps] = useState<MassConsensusStep[]>(_steps || defaultMassConsensusProcess);
	const [showAddStep, setShowAddStep] = useState(false);

	useEffect(() => {
		setSteps(_steps);
	}, [_steps]);

	// Calculate available steps (not already in the current process)
	const currentStepScreens = steps.map(s => s.screen);
	const availableSteps = ALL_STEPS.filter(
		step => !currentStepScreens.includes(step)
	);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = steps.findIndex((step) => step.screen === active.id);
			const newIndex = steps.findIndex((step) => step.screen === over.id);

			const newStepsOrder = arrayMove(steps, oldIndex, newIndex);
			setSteps(newStepsOrder);

			if (statementId) {
				reorderMassConsensusProcessToDB({
					steps: newStepsOrder,
					statementId,
					loginType
				});
			}
		}
	};

	function handleDelete(screen: MassConsensusPageUrls) {
		removeMassConsensusStep(statementId, loginType, screen);
	}

	const handleAddStep = (screen: MassConsensusPageUrls) => {
		const newStep: MassConsensusStep = {
			screen,
			text: STEP_DISPLAY_NAMES[screen] || screen
		};
		const updatedSteps = [...steps, newStep];
		setSteps(updatedSteps);

		if (statementId) {
			reorderMassConsensusProcessToDB({
				steps: updatedSteps,
				statementId,
				loginType
			});
		}

		setShowAddStep(false);
	};

	return (
		<div className={styles['process-setting']}>
			<h4>{processName}</h4>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={steps.map((step) => step.screen)}
					strategy={verticalListSortingStrategy}
				>
					{steps && steps.map((process, index) => (
						<SortableItem
							key={`${loginType}-${process.screen}`}
							id={process.screen}
							index={index}
							process={process}
							onDelete={handleDelete}
							t={t}
						/>
					))}
				</SortableContext>
			</DndContext>

			{/* Add Step Button / Dropdown */}
			{!showAddStep ? (
				<button
					className={styles['add-step-button']}
					onClick={() => setShowAddStep(true)}
					aria-label="Add new step to process"
					aria-expanded={showAddStep}
					disabled={availableSteps.length === 0}
				>
					<PlusIcon className={styles['add-step-button__icon']} />
					<span className={styles['add-step-button__text']}>
						{availableSteps.length === 0
							? t('All steps added')
							: t('Add Step')}
					</span>
				</button>
			) : (
				<div className={styles['add-step-dropdown']}>
					<div className={styles['add-step-dropdown__header']}>
						<span>{t('Select a step to add')}</span>
						<button
							onClick={() => setShowAddStep(false)}
							aria-label="Close add step menu"
							className={styles['add-step-dropdown__close']}
						>
							<CloseIcon />
						</button>
					</div>
					<div className={styles['add-step-dropdown__list']}>
						{availableSteps.length > 0 ? (
							availableSteps.map(step => (
								<button
									key={step}
									className={styles['add-step-dropdown__item']}
									onClick={() => handleAddStep(step)}
									aria-label={`Add ${STEP_DISPLAY_NAMES[step]} to process`}
								>
									{t(STEP_DISPLAY_NAMES[step] || step)}
								</button>
							))
						) : (
							<div className={styles['add-step-dropdown__empty']}>
								{t('All steps have been added to this process')}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default ProcessSetting;