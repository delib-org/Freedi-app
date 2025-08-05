import { FC, useEffect, useState } from 'react';
import styles from './QuestionnaireSettings.module.scss';
import { QuestionnaireQuestion } from 'delib-npm/dist/models/questionnaire/questionnaireModel';
import { updateQuestionnaireDetails } from '@/controllers/db/questionnaries/setQuestionnairs';
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
            setQuestions(Object.values(statement.questionnaire?.questions || {}));
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
            }).then(result => {
                setDetailsSaved(true);
            }).catch(error => {
                logger.error('Error updating questionnaire details:', error);
            });

        } catch (error) {
            logger.error('Error saving questionnaire:', error);
        }
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
                            {questions.map((question) => (
                                <div 
                                    key={question.questionnaireQuestionId} 
                                    className={`${styles.questionItem} ${
                                        animatingQuestions.includes(question.questionnaireQuestionId) 
                                            ? styles.slideIn 
                                            : ''
                                    }`}
                                >
                                    <QuestionnaireQuestionSettings
                                        question={question}
                                        setQuestion={setNewQuestion}
                                    />
                                </div>
                            ))}
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
                                <QuestionnaireQuestionSettings setQuestion={setNewQuestion} />
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