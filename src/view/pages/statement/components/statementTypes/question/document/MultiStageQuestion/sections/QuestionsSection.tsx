import React, { FC, DragEvent } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import Research from '@/assets/images/Research.png';
import styles from '../MultiStageQuestion.module.scss';

interface QuestionsSectionProps {
	stages: Statement[];
	draggedIndex: number | null;
	onDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
	onDragOver: (e: DragEvent<HTMLDivElement>) => void;
	onDrop: (e: DragEvent<HTMLDivElement>, index: number) => void;
	onDragEnd: () => void;
	onAddSubQuestion: () => void;
}

export const QuestionsSection: FC<QuestionsSectionProps> = ({
	stages,
	draggedIndex,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	onAddSubQuestion,
}) => {
	const { t } = useTranslation();

	return (
		<div className={styles.stageCard} id="questions">
			<div className={styles.imgContainer}>
				<img
					draggable={false}
					src={Research}
					alt={t('Research Graphic')}
					className={styles.graphic}
				/>
			</div>
			<div className={styles.topicDescription}>
				<div className={styles.magGlass}>⌕</div>
				<h4>{t('Preliminary questions')}</h4>
			</div>
			<div className={styles.subDescription}>
				<h5>{t('Connected questions worth discussing')}</h5>
			</div>
			<div className={styles.subElementsWrapper}>
				{stages.map((stage, index) => (
					<div
						key={stage.statementId}
						className={`${styles.stageContainer} ${draggedIndex === index ? styles.dragging : ''}`}
						draggable
						onDragStart={(e) => onDragStart(e, index)}
						onDragOver={(e) => onDragOver(e)}
						onDrop={(e) => onDrop(e, index)}
						onDragEnd={onDragEnd}
						aria-label={`Draggable stage ${index + 1}`}
					>
						<SubGroupCard statement={stage} />
					</div>
				))}
			</div>
			<div className={`btns ${styles['add-stage']}`}>
				<button className="btn btn--secondary" onClick={onAddSubQuestion}>
					{t('Add Sub-Question')}
				</button>
			</div>
		</div>
	);
};
