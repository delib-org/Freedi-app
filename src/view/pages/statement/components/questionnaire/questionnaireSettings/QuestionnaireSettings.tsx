import React, { FC, useEffect, useState } from 'react';
import styles from './QuestionnaireSettings.module.scss';
import { QuestionnaireQuestion, QuestionType, EvaluationUI, CutoffBy } from 'delib-npm';
import { updateQuestionnaireDetails, updateQuestionOrder } from '@/controllers/db/questionnaries/setQuestionnairs';
import { useDispatch, useSelector } from 'react-redux';
import { logger } from '@/services/logger/logger';
import QuestionnaireQuestionSettings from './questionnaireQuestionSettings/QuestionnarieQuestionSettings';
import { setStatements, statementSelectorById } from '@/redux/statements/statementsSlice';
import { useNavigate, useParams } from 'react-router';
import { getStatementFromDB, getSubQuestions } from '@/controllers/db/statements/getStatement';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Question Item Component
interface SortableItemProps {
    id: string;
    question: QuestionnaireQuestion;
    index: number;
    isExpanded: boolean;
    onToggleExpand: () => void;
    setQuestion: (question: QuestionnaireQuestion) => void;
    animatingQuestions: string[];
}

const SortableQuestionItem: React.FC<SortableItemProps> = ({
    id,
    question,
    index,
    isExpanded,
    onToggleExpand,
    setQuestion,
    animatingQuestions,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`${styles.questionItem} ${
                animatingQuestions.includes(question.questionnaireQuestionId)
                    ? styles.slideIn
                    : ''
            } ${isDragging ? styles.dragging : ''}`}
        >
            <div className={styles.questionHeader}>
                <div
                    className={styles.dragHandle}
                    {...attributes}
                    {...listeners}
                >
                    ⋮⋮
                </div>
                <div className={styles.questionInfo}>
                    <span className={styles.questionNumber}>Q{index + 1}</span>
                    <h4 className={styles.questionTitle}>
                        {question.question || 'Untitled Question'}
                    </h4>
                    {question.questionType && (
                        <span className={styles.questionType}>{question.questionType}</span>
                    )}
                </div>
                <button
                    className={styles.expandButton}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
                    }}
                    type="button"
                >
                    {isExpanded ? '▼' : '▶'}
                </button>
            </div>
            {isExpanded && (
                <div className={styles.questionContent}>
                    <QuestionnaireQuestionSettings
                        question={question}
                        setQuestion={setQuestion}
                    />
                </div>
            )}
        </div>
    );
};

const QuestionnaireSettings: FC = () => {
    const { t } = useUserConfig();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { questionnaireId } = useParams<{ questionnaireId: string }>();
    const statement = useSelector(statementSelectorById(questionnaireId));
    const { parentId } = statement || {};
    const [title, setTitle] = useState<string | null>(null);
    const [description, setDescription] = useState<string | null>(null);
    const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
    const [isAddingQuestion, setIsAddingQuestion] = useState(false);
    const [detailsSaved, setDetailsSaved] = useState(false);
    const [animatingQuestions, setAnimatingQuestions] = useState<string[]>([]);
    const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
    const [activeId, setActiveId] = useState<string | null>(null);

    // New question form state
    const [newQuestion, setNewQuestion] = useState<QuestionnaireQuestion | null>(null);

    // DnD Kit sensors
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

    useEffect(() => {
        if (questionnaireId && !statement) {
            getStatementFromDB(questionnaireId);
        }

    }, [questionnaireId]);

    useEffect(() => {
        if (parentId) {
            getSubQuestions(parentId).then(subQuestions => {
                dispatch(setStatements(subQuestions));
            }).catch(error => {
                logger.error('Error fetching sub-questions:', error);
            });
        }
    }, [parentId]);

    useEffect(() => {
        if (statement) {
            setTitle(statement.questionnaire?.question || '');
            setDescription(statement.questionnaire?.description || '');
            const questionsArray = Object.values(statement.questionnaire?.questions || {});
            logger.info('Questions before sort:', { questions: questionsArray.map(q => ({ id: q.questionnaireQuestionId, order: q.order })) });
            // Sort questions by order field
            questionsArray.sort((a, b) => (a.order || 0) - (b.order || 0));
            logger.info('Questions after sort:', { questions: questionsArray.map(q => ({ id: q.questionnaireQuestionId, order: q.order })) });
            setQuestions(questionsArray);
        }
    }, [statement]);

    useEffect(() => {
        setDetailsSaved(false);
    }, [title, description]);

    useEffect(() => {
        if (newQuestion) {
            // Add the new question with animation
            const newQuestionWithAnimation = { ...newQuestion };
            setQuestions(prev => [...prev, newQuestionWithAnimation]);
            setAnimatingQuestions(prev => [...prev, newQuestion.questionnaireQuestionId]);
            
            // Scroll to the new question
            setTimeout(() => {
                const questionElements = document.querySelectorAll(`.${styles.questionItem}`);
                const lastQuestion = questionElements[questionElements.length - 1];
                if (lastQuestion) {
                    lastQuestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
            
            // Remove from animating list after animation completes
            setTimeout(() => {
                setAnimatingQuestions(prev => 
                    prev.filter(id => id !== newQuestion.questionnaireQuestionId)
                );
            }, 600); // Match animation duration
            
            // Reset the form but keep it visible
            setNewQuestion(null);
            // Keep the form open so user can add more questions
            // setIsAddingQuestion(false);
        }
    }, [newQuestion, styles.questionItem]);

    const handleSave = (e) => {
        e.preventDefault();
        try {

            const data = new FormData(e.target);
            const dataObj = Object.fromEntries(data.entries());

            updateQuestionnaireDetails({
                statementId: questionnaireId,
                question: dataObj.question as string,
                description: dataObj.description as string,
            }).then(() => {
                setDetailsSaved(true);
            }).catch(error => {
                logger.error('Error updating questionnaire details:', error);
            });

        } catch (error) {
            logger.error('Error saving questionnaire:', error);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        
        if (over && active.id !== over.id) {
            const oldIndex = questions.findIndex(q => q.questionnaireQuestionId === active.id);
            const newIndex = questions.findIndex(q => q.questionnaireQuestionId === over.id);
            
            const newQuestions = arrayMove(questions, oldIndex, newIndex);
            
            // Update order values
            const updatedQuestions = newQuestions.map((q, idx) => ({
                ...q,
                order: idx + 1
            }));
            
            setQuestions(updatedQuestions);
            
            // Save to database
            await saveQuestionOrder(updatedQuestions);
        }
        
        setActiveId(null);
    };

    function handleFinish(){
        navigate(`/statement/${parentId}`);
    }
    
    const saveQuestionOrder = async (reorderedQuestions: QuestionnaireQuestion[]) => {
        try {
            const updatePromises = reorderedQuestions.map(question => 
                updateQuestionOrder({
                    questionnaireId: questionnaireId!,
                    questionnaireQuestionId: question.questionnaireQuestionId,
                    order: question.order
                })
            );
            
            await Promise.all(updatePromises);
            logger.info('Order saved to database successfully');
        } catch (error) {
            logger.error('Error updating question order:', error);
        }
    };

    const toggleQuestionExpanded = (questionId: string) => {
        const newExpanded = new Set(expandedQuestions);
        if (newExpanded.has(questionId)) {
            newExpanded.delete(questionId);
        } else {
            newExpanded.add(questionId);
        }
        setExpandedQuestions(newExpanded);
    };

    return (
        <div className={styles.questionnaireSettings}>
            <div className="wrapper">
                <h2>Create Questionnaire</h2>

                <div className={styles.section}>
                    <h3>Questionnaire Details</h3>

                </div>
                <section>
                    <form onSubmit={handleSave} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label htmlFor="title">Title</label>
                            <input
                                required
                                autoFocus
                                type="text"
                                id="title"
                                name="question"
                                value={title || ''}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter questionnaire title"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                name="description"
                                value={description || ''}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Enter questionnaire description"
                            />
                        </div>
                        <div className="btns">
                            <button type='submit' className='btn btn--secondary'>{t(detailsSaved ? "Details Saved" : "Save Details")} {detailsSaved && <CheckIcon />}</button>
                        </div>
                    </form>
                </section>
                {detailsSaved && (
                    <section>
                        <h3>Questions</h3>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={questions.map(q => q.questionnaireQuestionId)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className={styles.questionsList}>
                                    {questions.map((question, index) => (
                                        <SortableQuestionItem
                                            key={question.questionnaireQuestionId}
                                            id={question.questionnaireQuestionId}
                                            question={question}
                                            index={index}
                                            isExpanded={expandedQuestions.has(question.questionnaireQuestionId)}
                                            onToggleExpand={() => toggleQuestionExpanded(question.questionnaireQuestionId)}
                                            setQuestion={setNewQuestion}
                                            animatingQuestions={animatingQuestions}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                            <DragOverlay>
                                {activeId ? (
                                    <div className={`${styles.questionItem} ${styles.dragOverlay}`}>
                                        <div className={styles.questionHeader}>
                                            <div className={styles.dragHandle}>⋮⋮</div>
                                            <div className={styles.questionInfo}>
                                                <span className={styles.questionNumber}>
                                                    Q{questions.findIndex(q => q.questionnaireQuestionId === activeId) + 1}
                                                </span>
                                                <h4 className={styles.questionTitle}>
                                                    {questions.find(q => q.questionnaireQuestionId === activeId)?.question || 'Untitled Question'}
                                                </h4>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>

                        {!isAddingQuestion && (
                            <button
                                className="btn btn--secondary"
                                onClick={() => setIsAddingQuestion(true)}
                            >
                                Add Question
                            </button>
                        )}

                        {isAddingQuestion && (
                            <div className={styles.addQuestionForm}>
                                <QuestionnaireQuestionSettings 
                                    key={`new-question-${questions.length}`} // Force re-render with new key
                                    setQuestion={setNewQuestion} 
                                    question={{
                                        questionnaireQuestionId: '',
                                        statementId: '',
                                        question: '',
                                        description: '',
                                        questionType: null as unknown as QuestionType,
                                        evaluationUI: null as unknown as EvaluationUI,
                                        cutoffBy: null as unknown as CutoffBy,
                                        order: questions.length + 1
                                    }}
                                />
                                <button 
                                    className="btn btn--secondary"
                                    onClick={() => setIsAddingQuestion(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </section>)}

                <div className={styles.footer}>
                    <button className="btn btn--primary" onClick={handleFinish}>
                        {t("Finish")}
                    </button>
                    <button className="btn btn--secondary" onClick={() => window.history.back()}>
                        {t("Cancel")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuestionnaireSettings;