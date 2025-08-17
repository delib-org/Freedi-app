import React, { useState } from 'react';
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
	sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { MassConsensusStep, MassConsensusProcess, LoginType } from 'delib-npm';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { massConsensusProcessSelector } from '@/redux/massConsensus/massConsensusSlice';
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { reorderMassConsensusProcessToDB } from '@/controllers/db/massConsensus/setMassConsensus';
import QuestionSection from './QuestionSection';
import AddStepModal from './AddStepModal';
import styles from './AdminQuestionnairePanel.module.scss';

interface Props {
	loginType: LoginType;
}

const AdminQuestionnairePanel: React.FC<Props> = ({ loginType }) => {
	const { statementId } = useParams();
	const [showAddStepModal, setShowAddStepModal] = useState(false);
	const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
	const [questions, setQuestions] = useState<{ id: string; title: string; steps: MassConsensusStep[] }[]>([]);

	const defaultMassConsensusProcesses: MassConsensusProcess = {
		statementId: statementId || '',
		loginTypes: {
			[loginType]: {
				steps: defaultMassConsensusProcess,
				processName: 'Process Configuration',
			},
		},
	};

	const processList =
		useSelector(massConsensusProcessSelector(statementId)) ||
		defaultMassConsensusProcesses;

	const processData = processList.loginTypes?.[loginType] || 
		processList.loginTypes?.default || 
		defaultMassConsensusProcesses.loginTypes[loginType];

	const { steps = [], processName = 'Process Configuration' } = processData;

	// Single question with steps that move through stages
	React.useEffect(() => {
		const validSteps = steps.filter(step => step && step.screen);
		
		setQuestions([{
			id: statementId || 'main',
			title: 'Mass Consensus Process',
			steps: validSteps
		}]);
	}, [steps.length, statementId]);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		console.info('=== DRAG END EVENT START ===');
		console.info('Active ID:', active.id);
		console.info('Over ID:', over?.id);
		console.info('Login Type:', loginType);
		console.info('Statement ID:', statementId);
		console.info('Process Name:', processName);

		if (!over || active.id === over.id) {
			console.info('No drag action needed (same position or no target)');
			return;
		}

		const activeQuestionId = active.data.current?.questionId;
		const overQuestionId = over.data.current?.questionId;

		if (activeQuestionId !== overQuestionId) {
			return; // Don't allow moving between questions for now
		}

		const question = questions.find(q => q.id === activeQuestionId);
		if (!question) {
			return;
		}

		// Find indices based on the ID format that includes index
		const oldIndex = question.steps.findIndex((step, idx) => {
			const stepId = step?.screen 
				? `${step.screen}-${activeQuestionId}-${idx}` 
				: `step-${activeQuestionId}-${idx}`;

			return stepId === active.id;
		});
		const newIndex = question.steps.findIndex((step, idx) => {
			const stepId = step?.screen 
				? `${step.screen}-${overQuestionId}-${idx}` 
				: `step-${overQuestionId}-${idx}`;

			return stepId === over.id;
		});

		if (oldIndex !== -1 && newIndex !== -1) {
			console.info('Found indices - Old:', oldIndex, 'New:', newIndex);
			
			const newSteps = arrayMove(question.steps, oldIndex, newIndex);
			
			// Update local state first
			const updatedQuestions = questions.map(q => 
				q.id === activeQuestionId 
					? { ...q, steps: newSteps }
					: q
			);
			setQuestions(updatedQuestions);

			// Collect all steps from all questions in the correct order
			const allSteps = updatedQuestions.reduce((acc, q) => {
				return [...acc, ...q.steps];
			}, [] as MassConsensusStep[]);

			// Steps no longer need statementId
			const stepsWithStatementId = allSteps;

			if (statementId) {
				console.info('=== SENDING TO DATABASE ===');
				console.info('Total steps count:', stepsWithStatementId.length);
				console.info('Steps order:', stepsWithStatementId.map(s => s.screen));
				console.info('Calling reorderMassConsensusProcessToDB with:', {
					statementId,
					loginType,
					processName,
					stepsCount: stepsWithStatementId.length
				});
				
				await reorderMassConsensusProcessToDB({ 
					steps: stepsWithStatementId, 
					statementId, 
					loginType,
					processName 
				});
				
				console.info('=== DATABASE UPDATE COMPLETE ===');
			} else {
				console.error('No statementId available for database update!');
			}
		} else {
			console.error('Could not find indices for reordering');
		}
	};

	const handleAddStep = (questionId: string) => {
		setSelectedQuestionId(questionId);
		setShowAddStepModal(true);
	};

	const handleAddStepConfirm = async (step: MassConsensusStep) => {
		setQuestions(prev => prev.map(q => 
			q.id === selectedQuestionId 
				? { ...q, steps: [...q.steps, step] }
				: q
		));

		// Update database
		const allSteps = questions.reduce((acc, q) => {
			if (q.id === selectedQuestionId) {
				return [...acc, ...q.steps, step];
			}
			return [...acc, ...q.steps];
		}, [] as MassConsensusStep[]);

		if (statementId) {
			console.info('Adding new step to database:', step);
			await reorderMassConsensusProcessToDB({ 
				steps: allSteps, 
				statementId, 
				loginType,
				processName 
			});
		}

		setShowAddStepModal(false);
	};

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<h2>Mass Consensus Process Configuration</h2>
				<div className={styles.stage}>
					Current Stage: {steps[0]?.screen || 'Introduction'}
				</div>
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<div className={styles.questions}>
					{questions.map((question) => (
						<QuestionSection
							key={question.id}
							questionId={question.id}
							title={question.title}
							steps={question.steps}
							onAddStep={() => handleAddStep(question.id)}
							loginType={loginType}
						/>
					))}
				</div>
			</DndContext>

			{/* Single question approach - removed add question button */}

			{showAddStepModal && (
				<AddStepModal
					onClose={() => setShowAddStepModal(false)}
					onConfirm={handleAddStepConfirm}
				/>
			)}
		</div>
	);
};

export default AdminQuestionnairePanel;