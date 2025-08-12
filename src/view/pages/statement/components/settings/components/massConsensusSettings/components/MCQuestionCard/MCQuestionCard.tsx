import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  MCQuestion, 
  MCQuestionType,
  getDefaultStepsForQuestionType 
} from 'delib-npm';
import { 
  updateMCQuestion, 
  deleteMCQuestion,
  changeMCQuestionType 
} from '@/controllers/db/mcSessions';
import styles from './MCQuestionCard.module.scss';

interface Props {
  question: MCQuestion;
  index: number;
  sessionId: string;
}

const MCQuestionCard: React.FC<Props> = ({ question, index, sessionId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState(question.content.question);
  const [editedDescription, setEditedDescription] = useState(question.content.description || '');
  const [selectedType, setSelectedType] = useState(question.questionType);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.questionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = async () => {
    if (!editedQuestion.trim()) {
      alert('Question cannot be empty');
      return;
    }
    
    await updateMCQuestion(sessionId, question.questionId, {
      content: {
        question: editedQuestion,
        description: editedDescription || undefined
      }
    });
    
    if (selectedType !== question.questionType) {
      await changeMCQuestionType(
        sessionId, 
        question.questionId, 
        selectedType,
        question.sessionId
      );
    }
    
    setIsEditing(false);
  };
  
  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this question?')) {
      await deleteMCQuestion(sessionId, question.questionId);
    }
  };
  
  const getQuestionTypeName = (type: MCQuestionType) => {
    const names = {
      [MCQuestionType.FULL_CONSENSUS]: 'Full Consensus',
      [MCQuestionType.QUICK_VOTE]: 'Quick Vote',
      [MCQuestionType.BRAINSTORM_ONLY]: 'Brainstorm Only',
      [MCQuestionType.EVALUATE_ONLY]: 'Evaluate Only',
      [MCQuestionType.CUSTOM]: 'Custom'
    };
    return names[type] || type;
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.questionCard}>
      <div className={styles.cardHeader}>
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <span className={styles.dragIcon}>⋮⋮</span>
          <span className={styles.questionNumber}>Q{index + 1}</span>
        </div>
        
        <div className={styles.questionInfo}>
          {isEditing ? (
            <div className={styles.editForm}>
              <input
                type="text"
                value={editedQuestion}
                onChange={(e) => setEditedQuestion(e.target.value)}
                className={styles.questionInput}
                placeholder="Enter question"
              />
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className={styles.descriptionInput}
                placeholder="Optional description"
                rows={2}
              />
              <div className={styles.typeSelector}>
                <label>Question Type:</label>
                <select 
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as MCQuestionType)}
                  className={styles.typeSelect}
                >
                  <option value={MCQuestionType.FULL_CONSENSUS}>Full Consensus</option>
                  <option value={MCQuestionType.QUICK_VOTE}>Quick Vote</option>
                  <option value={MCQuestionType.BRAINSTORM_ONLY}>Brainstorm Only</option>
                  <option value={MCQuestionType.EVALUATE_ONLY}>Evaluate Only</option>
                  <option value={MCQuestionType.CUSTOM}>Custom</option>
                </select>
              </div>
            </div>
          ) : (
            <>
              <h4 className={styles.questionText}>{question.content.question}</h4>
              {question.content.description && (
                <p className={styles.questionDescription}>{question.content.description}</p>
              )}
              <div className={styles.questionMeta}>
                <span className={styles.typeTag}>{getQuestionTypeName(question.questionType)}</span>
                <span className={styles.stepsCount}>{question.steps.length} steps</span>
                {question.required && <span className={styles.requiredTag}>Required</span>}
              </div>
            </>
          )}
        </div>
        
        <div className={styles.cardActions}>
          {isEditing ? (
            <>
              <button 
                className={styles.saveButton}
                onClick={handleSave}
              >
                Save
              </button>
              <button 
                className={styles.cancelButton}
                onClick={() => {
                  setIsEditing(false);
                  setEditedQuestion(question.content.question);
                  setEditedDescription(question.content.description || '');
                  setSelectedType(question.questionType);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button 
                className={styles.expandButton}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? '▲' : '▼'}
              </button>
              <button 
                className={styles.editButton}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
              <button 
                className={styles.deleteButton}
                onClick={handleDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      
      {isExpanded && !isEditing && (
        <div className={styles.expandedContent}>
          <div className={styles.stepsSection}>
            <h5>Steps Configuration:</h5>
            <div className={styles.stepsList}>
              {question.steps.map((step, stepIndex) => (
                <div key={stepIndex} className={styles.stepItem}>
                  <span className={styles.stepNumber}>{stepIndex + 1}.</span>
                  <span className={styles.stepName}>{step.screen}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCQuestionCard;