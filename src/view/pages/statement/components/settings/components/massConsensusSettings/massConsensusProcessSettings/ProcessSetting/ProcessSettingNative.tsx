import React, { useState, useEffect } from 'react';
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

// Define all possible steps
const ALL_STEPS: MassConsensusPageUrls[] = [
	MassConsensusPageUrls.introduction,
	MassConsensusPageUrls.userDemographics,
	MassConsensusPageUrls.question,
	MassConsensusPageUrls.randomSuggestions,
	MassConsensusPageUrls.topSuggestions,
	MassConsensusPageUrls.mySuggestions,
	MassConsensusPageUrls.voting,
	MassConsensusPageUrls.results,
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
	[MassConsensusPageUrls.results]: 'Results Summary',
	[MassConsensusPageUrls.leaveFeedback]: 'Leave Feedback',
	[MassConsensusPageUrls.thankYou]: 'Thank You',
	[MassConsensusPageUrls.initialQuestion]: 'Initial Question',
};

const ProcessSettingNative = ({ processName, steps: _steps, loginType }: Props) => {
	const { statementId } = useParams();
	const { t } = useUserConfig();

	const [steps, setSteps] = useState<MassConsensusStep[]>(_steps || defaultMassConsensusProcess);
	const [showAddStep, setShowAddStep] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [draggedItem, setDraggedItem] = useState<string | null>(null);
	const [draggedOverItem, setDraggedOverItem] = useState<string | null>(null);

	useEffect(() => {
		if (_steps && _steps.length > 0) {
			setSteps(_steps);
		}
	}, [_steps]);

	// Calculate available steps (not already in the current process)
	const currentStepScreens = steps.map(s => s.screen);
	const availableSteps = ALL_STEPS.filter(
		step => !currentStepScreens.includes(step)
	);

	const handleDragStart = (e: React.DragEvent, screen: string) => {
		setDraggedItem(screen);
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', screen);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	};

	const handleDragEnter = (e: React.DragEvent, screen: string) => {
		e.preventDefault();
		setDraggedOverItem(screen);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		// Only clear if we're leaving the entire item
		const relatedTarget = e.relatedTarget as HTMLElement;
		if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
			setDraggedOverItem(null);
		}
	};

	const handleDrop = async (e: React.DragEvent, dropTargetScreen: string) => {
		e.preventDefault();

		if (draggedItem && draggedItem !== dropTargetScreen) {
			const oldIndex = steps.findIndex(step => step.screen === draggedItem);
			const newIndex = steps.findIndex(step => step.screen === dropTargetScreen);

			if (oldIndex !== -1 && newIndex !== -1) {
				const newSteps = [...steps];
				const [movedItem] = newSteps.splice(oldIndex, 1);
				newSteps.splice(newIndex, 0, movedItem);

				setSteps(newSteps);

				if (statementId) {
					try {
						await reorderMassConsensusProcessToDB({
							steps: newSteps,
							statementId,
							loginType
						});
					} catch (error) {
						console.error('Failed to save step order:', error);
						// Revert on error
						setSteps(steps);
					}
				}
			}
		}

		setDraggedItem(null);
		setDraggedOverItem(null);
	};

	const handleDragEnd = () => {
		setDraggedItem(null);
		setDraggedOverItem(null);
	};

	function handleDelete(screen: MassConsensusPageUrls) {
		if (!statementId) {
			console.error('No statement ID available for deleting step');

			return;
		}

		try {
			removeMassConsensusStep(statementId, loginType, screen);
		} catch (error) {
			console.error('Failed to delete step:', error);
		}
	}

	const handleAddStep = async (screen: MassConsensusPageUrls) => {
		if (!statementId) {
			console.error('No statement ID available for adding step');

			return;
		}

		setIsLoading(true);

		try {
			const newStep: MassConsensusStep = {
				screen,
				text: STEP_DISPLAY_NAMES[screen] || screen
			};
			const updatedSteps = [...steps, newStep];
			setSteps(updatedSteps);

			await reorderMassConsensusProcessToDB({
				steps: updatedSteps,
				statementId,
				loginType
			});

			setShowAddStep(false);
		} catch (error) {
			console.error('Failed to add step:', error);
			// Revert step addition on error
			setSteps(steps);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className={styles['process-setting']}>
			<h4>{processName}</h4>
			<div className={styles['process-items-container']}>
				{steps.map((process, index) => {
					const isDragging = draggedItem === process.screen;
					const isDraggedOver = draggedOverItem === process.screen;

					return (
						<div
							key={process.screen}
							draggable
							onDragStart={(e) => handleDragStart(e, process.screen)}
							onDragOver={handleDragOver}
							onDragEnter={(e) => handleDragEnter(e, process.screen)}
							onDragLeave={handleDragLeave}
							onDrop={(e) => handleDrop(e, process.screen)}
							onDragEnd={handleDragEnd}
							className={styles['process-item']}
							style={{
								opacity: isDragging ? 0.5 : 1,
								backgroundColor: isDraggedOver ? 'var(--background-hover, #f0f0f0)' : undefined,
								transform: isDraggedOver ? 'scale(1.02)' : undefined,
								transition: 'all 0.2s ease',
							}}
						>
							<div className={styles['process-item__drag-area']}>
								<span className={styles['process-item__content']}>
									{index + 1}: {t(process.text || process.screen)}
								</span>
							</div>
							<button
								onClick={() => handleDelete(process.screen)}
								className={styles['process-item__delete']}
								aria-label={`Delete ${process.text || process.screen}`}
								type="button"
							>
								<DeleteIcon />
							</button>
						</div>
					);
				})}
			</div>

			{/* Add Step Button / Dropdown */}
			{!showAddStep ? (
				<button
					className={styles['add-step-button']}
					onClick={() => setShowAddStep(true)}
					aria-label="Add new step to process"
					aria-expanded={showAddStep}
					disabled={availableSteps.length === 0 || isLoading || !statementId}
				>
					<PlusIcon className={styles['add-step-button__icon']} />
					<span className={styles['add-step-button__text']}>
						{isLoading
							? t('Adding...')
							: availableSteps.length === 0
								? t('All steps added')
								: !statementId
									? t('Statement ID required')
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
									disabled={isLoading}
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

export default ProcessSettingNative;