import { FC, useEffect, useState } from 'react';
import { getRandomUID, Questionnaire } from 'delib-npm';
import styles from './QuestionnaireSettings.module.scss';
import { QuestionnaireQuestion } from 'delib-npm/dist/models/questionnaire/questionnaireModel';
import { setQuestionnaire } from '@/controllers/db/questionnaries/setQuestionnairs';
import { useDispatch, useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logger } from '@/services/logger/logger';
import QuestionnaireQuestionSettings from './questionnaireQuestionSettings/QuestionnarieQuestionSettings';
import { setStatements, statementSelectorById } from '@/redux/statements/statementsSlice';
import { useParams } from 'react-router';
import { get } from 'http';
import { getSubQuestions } from '@/controllers/db/statements/getStatement';


const QuestionnaireSettings: FC = () => {
    const dispatch = useDispatch();
    const { statementId } = useParams<{ statementId: string }>();
    const statement = useSelector(statementSelectorById(statementId));
    const { parentId } = statement || {};
    const creator = useSelector(creatorSelector);
    const [title, setTitle] = useState<string | null>(null);
    const [description, setDescription] = useState<string | null>(null);
    const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
    const [isAddingQuestion, setIsAddingQuestion] = useState(false);

    // New question form state
    const [newQuestion, setNewQuestion] = useState<QuestionnaireQuestion | null>(null);

    useEffect(() => {
        if (parentId) {
            getSubQuestions(parentId).then(subQuestions => {
                dispatch(setStatements(subQuestions));
            }).catch(error => {
                logger.error('Error fetching sub-questions:', error);
            });
        }
    }, [parentId]);

    const handleSave = () => {
        try {
            if (!title.trim()) {
                alert('Please enter a questionnaire title');
                return;
            }

            if (questions.length === 0) {
                alert('Please add at least one question');
                return;
            }

            if (!creator || !creator.uid) throw new Error('Creator is not defined');

            const questionnaire: Questionnaire = {
                creatorId: creator?.uid,
                question: title,
                description: description || undefined,
                questionnaireId: getRandomUID(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                questions: [],
            };

            setQuestionnaire(questionnaire);
        } catch (error) {
            logger.error('Error saving questionnaire:', error);
        }
    };

    return (
        <div className={styles.questionnaireSettings}>
            <h2>Create Questionnaire</h2>

            <div className={styles.section}>
                <h3>Questionnaire Details</h3>

            </div>
            <section>
                <div className={styles.formGroup}>
                    <label htmlFor="title">Title</label>
                    <input
                        type="text"
                        id="title"
                        value={title || ''}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter questionnaire title"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        value={description || ''}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter questionnaire description"
                    />
                </div>
            </section>
            <section>
                <h3>Questions</h3>
                <div className={styles.questionsList}>
                    {questions.map((question, index) => (
                        <div key={index} className={styles.questionItem}>
                            <p>{question.question}</p>
                            {/* Add more question details as needed */}
                        </div>
                    ))}
                </div>

                <button
                    className="btn btn--secondary"
                    onClick={() => setIsAddingQuestion(true)}
                >
                    Add Question
                </button>

                {isAddingQuestion && (
                    <div className={styles.addQuestionForm}>
                        {/* Implement your question form here */}
                        <QuestionnaireQuestionSettings setQuestion={setNewQuestion} />
                    </div>
                )}
            </section>

            <div className={styles.footer}>
                <button className="btn btn--primary" onClick={handleSave}>
                    Create Questionnaire
                </button>
                <button className="btn btn--secondary" onClick={() => console.log('Cancel')}>
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default QuestionnaireSettings;