import React, { FC, useEffect, useState } from 'react';
import styles from './QuestionnaireSettings.module.scss';
import { QuestionnaireQuestion, QuestionType, EvaluationUI, CutoffBy } from 'delib-npm';
import { updateQuestionnaireDetails, updateQuestionOrder } from '@/controllers/db/questionnaries/setQuestionnairs';
import { useDispatch, useSelector } from 'react-redux';
import { logger } from '@/services/logger/logger';
import QuestionnaireQuestionSettings from './questionnaireQuestionSettings/QuestionnarieQuestionSettings';
import { setStatements, statementSelectorById } from '@/redux/statements/statementsSlice';
import { useParams } from 'react-router';
import { getStatementFromDB, getSubQuestions } from '@/controllers/db/statements/getStatement';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';

const QuestionnaireSettings: FC = () => {
    const { t } = useUserConfig();
    const dispatch = useDispatch();
    const { statementId } = useParams<{ statementId: string }>();
    const statement = useSelector(statementSelectorById(statementId));
    const { parentId } = statement || {};
    const [title, setTitle] = useState<string | null>(null);
    const [description, setDescription] = useState<string | null>(null);
    const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
    const [isAddingQuestion, setIsAddingQuestion] = useState(false);
    const [detailsSaved, setDetailsSaved] = useState(false);
    const [animatingQuestions, setAnimatingQuestions] = useState<string[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

    // New question form state
    const [newQuestion, setNewQuestion] = useState<QuestionnaireQuestion | null>(null);

    useEffect(() => {
        if (statementId && !statement) {
            getStatementFromDB(statementId);
        }

    }, [statementId]);

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
            logger.info('Questions before sort:', questionsArray.map(q => ({ id: q.questionnaireQuestionId, order: q.order })));
            // Sort questions by order field
            questionsArray.sort((a, b) => (a.order || 0) - (b.order || 0));
            logger.info('Questions after sort:', questionsArray.map(q => ({ id: q.questionnaireQuestionId, order: q.order })));
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
            
            // Remove from animating list after animation completes
            setTimeout(() => {
                setAnimatingQuestions(prev => 
                    prev.filter(id => id !== newQuestion.questionnaireQuestionId)
                );
            }, 600); // Match animation duration
            
            // Reset the form
            setNewQuestion(null);
            setIsAddingQuestion(false);
        }
    }, [newQuestion]);

    const handleSave = (e) => {
        e.preventDefault();
        try {

            const data = new FormData(e.target);
            const dataObj = Object.fromEntries(data.entries());

            updateQuestionnaireDetails({
                statementId: statementId,
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

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Add data to enable drag on Firefox
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);

        logger.info(`Dropping item from index ${draggedIndex} to index ${dropIndex}`);

        if (draggedIndex === null || draggedIndex === dropIndex) {
            return;
        }

        // Create a new array with all questions
        const newQuestions = [...questions];
        
        // Remove the dragged item and store it
        const [draggedQuestion] = newQuestions.splice(draggedIndex, 1);
        
        // Calculate the insertion index
        // If dragging down, we need to account for the removed element
        const insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
        
        // Insert it at the new position
        newQuestions.splice(insertIndex, 0, draggedQuestion);
        
        // Update order values
        const updatedQuestions = newQuestions.map((q, idx) => ({
            ...q,
            order: idx + 1
        }));
        
        logger.info('Updated questions order:', updatedQuestions.map(q => ({ id: q.questionnaireQuestionId, order: q.order })));
        
        setQuestions(updatedQuestions);
        
        // Save the new order to the database
        try {
            // Update all questions in parallel for better performance
            const updatePromises = updatedQuestions.map(question => 
                updateQuestionOrder({
                    questionnaireId: statementId!,
                    questionnaireQuestionId: question.questionnaireQuestionId,
                    order: question.order
                })
            );
            
            await Promise.all(updatePromises);
            logger.info('Order saved to database successfully');
            
            // Force re-fetch the statement to ensure we have the latest data
            if (statementId) {
                getStatementFromDB(statementId);
            }
        } catch (error) {
            logger.error('Error updating question order:', error);
        }
        
        setDraggedIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
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
                        <div className={styles.questionsList}>
                            {questions.map((question, index) => {
                                const isExpanded = expandedQuestions.has(question.questionnaireQuestionId);
                                return (
                                    <div 
                                        key={question.questionnaireQuestionId} 
                                        className={`${styles.questionItem} ${
                                            animatingQuestions.includes(question.questionnaireQuestionId) 
                                                ? styles.slideIn 
                                                : ''
                                        } ${draggedIndex === index ? styles.dragging : ''} ${
                                            dragOverIndex === index ? styles.dragOver : ''
                                        }`}
                                    >
                                        <div 
                                            className={styles.questionHeader}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onDragEnd={handleDragEnd}
                                        >
                                            <div className={styles.dragHandle}>⋮⋮</div>
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
                                                onClick={() => toggleQuestionExpanded(question.questionnaireQuestionId)}
                                                type="button"
                                            >
                                                {isExpanded ? '▼' : '▶'}
                                            </button>
                                        </div>
                                        {isExpanded && (
                                            <div className={styles.questionContent}>
                                                <QuestionnaireQuestionSettings
                                                    question={question}
                                                    setQuestion={setNewQuestion}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

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
                    <button className="btn btn--primary" onClick={handleSave}>
                        Create Questionnaire
                    </button>
                    <button className="btn btn--secondary" onClick={() => window.history.back()}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuestionnaireSettings;