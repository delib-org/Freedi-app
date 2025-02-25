import { DragEvent, FC, useContext, useEffect, useState, useMemo } from 'react';
import { StatementContext } from '../../../../StatementCont';
import styles from './MultiStageQuestion.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import AddStage from './addStage/AddStage';
import { useDispatch, useSelector } from 'react-redux';
import { setStatements, statementSubsSelector } from '@/redux/statements/statementsSlice';
import StageCard from './stages/StageCard';
import { updateStatementsOrderToDB } from '@/controllers/db/statements/setStatements';
import { Statement } from '@/types/statement/StatementTypes';
import { StatementType } from '@/types/TypeEnums';

const MultiStageQuestion: FC = () => {
	const { statement } = useContext(StatementContext);
	const dispatch = useDispatch();
	const statementsFromStore = useSelector(statementSubsSelector(statement?.statementId));

	const initialStages = useMemo(() =>
		statementsFromStore
			.filter((sub: Statement) => sub.statementType === StatementType.stage)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		, [statementsFromStore]);

	const [showAddStage, setShowAddStage] = useState<boolean>(false);
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

	const handleDragStart = (
		e: DragEvent<HTMLDivElement>,
		index: number
	): void => {
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = 'move';

		// Required for Firefox
		e.dataTransfer.setData('text/plain', '');
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	};

	const handleDrop = (
		e: DragEvent<HTMLDivElement>,
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

	return (
		<div className={styles.wrapper}>
			<h2>Question</h2>
			<p>{statement?.description}</p>
			<Button
				text='Add Stage'
				type='button'
				buttonType={ButtonType.PRIMARY}
				onClick={() => setShowAddStage(true)}
			/>

			{showAddStage && (
				<Modal>
					<AddStage setShowAddStage={setShowAddStage} />
				</Modal>
			)}

			<div className={styles.stagesWrapper}>
				<StageCard statement={statement} isDescription={true} />
				{initialStages.map((stage, index) => (
					<div
						key={stage.statementId}
						className={`${styles.stageContainer} ${draggedIndex === index ? styles.dragging : ''}`}
						draggable
						onDragStart={(e) => handleDragStart(e, index)}
						onDragOver={handleDragOver}
						onDrop={(e) => handleDrop(e, index)}
						onDragEnd={handleDragEnd}
					>
						<div className={styles.dragHandle}></div>
						<StageCard statement={stage} />
					</div>
				))}
				<StageCard statement={statement} isSuggestions={true} />
			</div>
		</div>
	);
};

export default MultiStageQuestion;
