import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { MCQuestion } from 'delib-npm';
import { reorderMCQuestions } from '@/controllers/db/mcSessions';
import MCQuestionCard from '../MCQuestionCard/MCQuestionCard';
import styles from './MCQuestionList.module.scss';

interface Props {
  sessionId: string;
  questions: MCQuestion[];
  onReorder: (questions: MCQuestion[]) => void;
}

const MCQuestionList: React.FC<Props> = ({ sessionId, questions, onReorder }) => {
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = questions.findIndex(q => q.questionId === active.id);
    const newIndex = questions.findIndex(q => q.questionId === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newQuestions = arrayMove(questions, oldIndex, newIndex);
      
      // Update order property
      const reorderedQuestions = newQuestions.map((q, index) => ({
        ...q,
        order: index
      }));
      
      // Update local state
      onReorder(reorderedQuestions);
      
      // Save to database if sessionId exists
      if (sessionId) {
        await reorderMCQuestions(sessionId, reorderedQuestions);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={questions.map(q => q.questionId)}
        strategy={verticalListSortingStrategy}
      >
        <div className={styles.questionList}>
          {questions.map((question, index) => (
            <MCQuestionCard
              key={question.questionId}
              question={question}
              index={index}
              sessionId={sessionId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default MCQuestionList;