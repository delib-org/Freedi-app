import React, { FC, DragEvent } from 'react';
import { Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import styles from '../MultiStageQuestion.module.scss';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';

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
  const { t } = useUserConfig();

  return (
    <div className={styles.stageCard} id="questions">
      <div className={styles.topicDescription}>
        <div className={styles.icon}>
          <QuestionIcon />
        </div>
        <h2>{t("Preliminary questions")}</h2>
      </div>
      <div className={styles.subDescription}>
        <h5>{t("Connected questions worth discussing")}</h5>
      </div>
      <div className={styles.subElementsWrapper}>
        {stages.map((stage, index) => (
          <div
            key={stage.statementId}
            className={`${styles.stageContainer} ${draggedIndex === index ? styles.dragging : ""}`}
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
      <div className={`btns ${styles["add-stage"]}`}>
        <button
          className="btn btn--secondary"
          onClick={onAddSubQuestion}
        >
          {t("Add Sub-Question")}
        </button>
      </div>
    </div>
  );
};