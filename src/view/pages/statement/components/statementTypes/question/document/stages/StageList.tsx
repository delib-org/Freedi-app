import InfoImage from '@/assets/images/multiStageQuestion/info.png';
import QuestionImage from '@/assets/images/multiStageQuestion/questions.png';
import SuggestionImage from '@/assets/images/multiStageQuestion/suggestions.png';
import VotingImage from '@/assets/images/multiStageQuestion/voting.png';
import SummaryImage from '@/assets/images/multiStageQuestion/summary.png';
import React, { DragEvent, useState } from 'react';
import { Statement } from 'delib-npm';
import StageCard from './StageCard';
import { updateStatementsOrderToDB } from '@/controllers/db/statements/setStatements';
import { setStatements } from '@/redux/statements/statementsSlice';
import { useDispatch } from 'react-redux';
import styles from './StageList.module.scss';

type HeaderProps = {
	imageType: 'info' | 'questions' | 'suggestions' | 'voting' | 'summary';
	statements: Statement[];
	isSuggestions?: boolean
};

const imagesMap: Record<HeaderProps['imageType'], string> = {
	info: InfoImage,
	questions: QuestionImage,
	suggestions: SuggestionImage,
	voting: VotingImage,
	summary: SummaryImage,
};

const StageList: React.FC<HeaderProps> = ({ imageType, statements, isSuggestions }) => {
	const imageSrc = imagesMap[imageType];
	const dispatch = useDispatch();

	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [draggedItem, setDraggedItem] = useState<null | { index: number; indexOffset: number; y: number }>(null);

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
		const newStages = [...statements];
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
		<div className={styles.stageListContainer}>
			<header>
				<img src={imageSrc} alt={imageType} />
			</header>

			{(() => {
				if (isSuggestions) {
					return <StageCard statement={statements[0]} isSuggestions={true} />;
				}
				if (statements.length === 1) {
					return <StageCard statement={statements[0]} />;
				}

				return statements.map((stage, index) => (
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
				));
			})()}

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
					<StageCard statement={statements[draggedItem.index]} />
				</div>
			)}
		</div>
	);

};

export default StageList