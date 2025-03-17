import {
	DragEvent,
	FC,
	useContext,
	useState,
	useMemo,
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
import { Statement, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const MultiStageQuestion: FC = () => {
	const { statement } = useContext(StatementContext);
	const { t } = useUserConfig();
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
	const [draggedItem, setDraggedItem] = useState<null | { index: number;indexOffset: number; y: number }>(null);

	const handleDragStart = (
		e: DragEvent<HTMLDivElement>,
		index: number
	): void => {
		setDraggedIndex(index);
		const topOfTarget = e.currentTarget.getBoundingClientRect().top
		setDraggedItem({ 
			index, 
			indexOffset: e.clientY - topOfTarget,
			y: topOfTarget
		});
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
		e.preventDefault();
		if (draggedItem) {
			setDraggedItem((prev) => prev ? { ...prev, y: e.clientY - draggedItem.indexOffset } : null);
		}
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
	};

	const handleDragEnd = (): void => {
		setDraggedItem(null);
		setDraggedIndex(null);
	};

	return (
		<>
			{showAddStage && (
				<Modal>
					<AddStage setShowAddStage={setShowAddStage} />
				</Modal>
			)}

			<div className={styles.stagesWrapper}>
				<h2 className={styles.title}>
					{t('Document')}: {statement.statement}
				</h2>
				<div className={styles.description}>
					{statement?.description}
				</div>
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
					>
						<div
							className={styles.dragHandle}
							aria-hidden='true'
						></div>
						<StageCard statement={stage} />
					</div>
				))}
				{draggedItem && (
					<div
						className={styles.ghostItem}
						style={{
						top: `${draggedItem.y}px`,
						position: "absolute",
						transform: "translateX(-20%)",
						opacity: 0.5,
						pointerEvents: "none",
						}}
					>
						<StageCard statement={initialStages[draggedItem.index]} />
					</div>
				)}
				<StageCard statement={statement} isSuggestions={true} />
			</div>
			<div className={`btns ${styles['add-stage']}`}>
				<Button
					text={t('Add sub-question')}
					type='button'
					buttonType={ButtonType.PRIMARY}
					onClick={() => setShowAddStage(true)}
				/>
			</div>
		</>
	);
};

export default MultiStageQuestion;
