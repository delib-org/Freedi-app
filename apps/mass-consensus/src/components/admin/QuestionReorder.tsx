'use client';

import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './Admin.module.scss';

interface QuestionReorderProps {
  questions: Statement[];
  onReorder: (questions: Statement[]) => void;
  onRemove: (questionId: string) => void;
}

interface SortableItemProps {
  question: Statement;
  index: number;
  onRemove: (questionId: string) => void;
}

/**
 * Individual sortable question item
 */
function SortableItem({ question, index, onRemove }: SortableItemProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.statementId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.reorderItem} ${isDragging ? styles.dragging : ''}`}
      {...attributes}
    >
      <div className={styles.dragHandle} {...listeners}>
        <GripIcon />
      </div>
      <div className={styles.reorderNumber}>{index + 1}</div>
      <span className={styles.reorderText}>{question.statement}</span>
      <button
        type="button"
        className={styles.removeButton}
        onClick={() => onRemove(question.statementId)}
      >
        {t('remove')}
      </button>
    </div>
  );
}

/**
 * Component for reordering questions using drag and drop
 */
export default function QuestionReorder({
  questions,
  onReorder,
  onRemove,
}: QuestionReorderProps) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = questions.findIndex((q) => q.statementId === active.id);
      const newIndex = questions.findIndex((q) => q.statementId === over.id);
      onReorder(arrayMove(questions, oldIndex, newIndex));
    }
  };

  if (questions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
        {t('noQuestionsToReorder')}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={questions.map((q) => q.statementId)}
        strategy={verticalListSortingStrategy}
      >
        <div className={styles.reorderList}>
          {questions.map((question, index) => (
            <SortableItem
              key={question.statementId}
              question={question}
              index={index}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Grip icon for drag handle
 */
function GripIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
