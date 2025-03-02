import {
	DragEvent,
	FC,
	useContext,
	useState,
	useMemo,
	KeyboardEvent,
} from 'react';
import { StatementContext } from '../../../../StatementCont';
import styles from './MultiStageQuestion.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import AddStage from './addStage/AddStage';
import { useDispatch, useSelector } from 'react-redux';
import {
	setStatements,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import StageCard from './stages/StageCard';
import { updateStatementsOrderToDB } from '@/controllers/db/statements/setStatements';
import { Statement } from '@/types/statement/StatementTypes';
import { StatementType } from '@/types/TypeEnums';

const MultiStageQuestion: FC = () => {
	const { statement } = useContext(StatementContext);
	const dispatch = useDispatch();
	const statementsFromStore = useSelector(
		statementSubsSelector(statement?.statementId)
	);

	const initialStages = useMemo(
		() =>
			statementsFromStore
				.filter(
					(sub: Statement) =>
						sub.statementType === StatementType.question
				)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[statementsFromStore]
	);

	const [showAddStage, setShowAddStage] = useState<boolean>(false);
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

	const handleDragStart = (
		e: DragEvent<HTMLButtonElement>,
		index: number
	): void => {
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = 'move';

		// Required for Firefox
		e.dataTransfer.setData('text/plain', '');
	};

	const handleDragOver = (e: DragEvent<HTMLButtonElement>): void => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	};

	const handleDrop = (
		e: DragEvent<HTMLButtonElement>,
		dropIndex: number
	): void => {
		e.preventDefault();
		if (draggedIndex === null || draggedIndex === dropIndex) return;

		const newStages = [...initialStages];
		const draggedStage = newStages[draggedIndex];
		newStages.splice(draggedIndex, 1);
		newStages.splice(dropIndex, 0, draggedStage);

		newStages.forEach((stage, index) => {
			stage.order = index;
		});
		updateStatementsOrderToDB(newStages);

		dispatch(setStatements(newStages));
		setDraggedIndex(null);
	};

	const handleDragEnd = (): void => {
		setDraggedIndex(null);
	};

	const handleKeyDown = (
		e: KeyboardEvent<HTMLButtonElement>,
		index: number
	): void => {
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			const newIndex =
				e.key === 'ArrowUp'
					? Math.max(0, index - 1)
					: Math.min(initialStages.length - 1, index + 1);

			const newStages = [...initialStages];
			const movedStage = newStages[index];
			newStages.splice(index, 1);
			newStages.splice(newIndex, 0, movedStage);

			newStages.forEach((stage, i) => {
				stage.order = i;
			});
			updateStatementsOrderToDB(newStages);
			dispatch(setStatements(newStages));
		}
	};

	return (
		<>

			{showAddStage && (
				<Modal>
					<AddStage setShowAddStage={setShowAddStage} />
				</Modal>
			)}

			<div className={styles.stagesWrapper}>
				<h2 className={styles.title}>מסמך: {statement.statement}</h2>
				<div className={styles.description}>{statement?.description}</div>
				{initialStages.map((stage, index) => (
					<div
						key={stage.statementId}
						className={`${styles.stageContainer} ${draggedIndex === index ? styles.dragging : ''}`}
						draggable
						onDragStart={(e) => handleDragStart(e, index)}
						onDragOver={(e) => handleDragOver(e)}
						onDrop={(e) => handleDrop(e, index)}
						onDragEnd={handleDragEnd}
						aria-label={`Draggable stage ${index + 1}`}
						onKeyDown={(e) => handleKeyDown(e, index)}
					>
						<div
							className={styles.dragHandle}
							aria-hidden='true'
						></div>
						<StageCard statement={stage} />
					</div>
				))}
				<StageCard statement={statement} isSuggestions={true} />
			</div>
			<Button
				text='Add Stage'
				type='button'
				buttonType={ButtonType.PRIMARY}
				onClick={() => setShowAddStage(true)}
			/>
		</>
	);
};

export default MultiStageQuestion;
