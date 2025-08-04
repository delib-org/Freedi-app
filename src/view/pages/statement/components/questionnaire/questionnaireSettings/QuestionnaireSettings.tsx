import { FC, useState } from 'react';
import { QuestionType, EvaluationUI, Statement, Questionnaire, getRandomUID } from 'delib-npm';
import { v4 as uuidv4 } from 'uuid';
import styles from './QuestionnaireSettings.module.scss';
import { QuestionnaireQuestion } from 'delib-npm/dist/models/questionnaire/questionnaireModel';


// Define Questionnaire type based on the schema you provided


const QuestionnaireSettings: FC = () => {
    const [title, setTitle] = useState<string | null>(null);
    const [description, setDescription] = useState<string | null>(null);
    const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
    const [isAddingQuestion, setIsAddingQuestion] = useState(false);

    // New question form state
    const [newQuestion, setNewQuestion] = useState<QuestionnaireQuestion|null>(null);

    const handleSave = () => {
        if (!title.trim()) {
            alert('Please enter a questionnaire title');
            return;
        }

        if (questions.length === 0) {
            alert('Please add at least one question');
            return;
        }

        const questionnaire: Partial<Questionnaire> = {
            question: title,
            description: description || undefined,
            questionnaireId: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            questions: questions.map(q => ({
                statement: q.statement as Statement,
                questionType: q.questionType,
                EvaluationUI: EvaluationUI.suggestions,
                question: q.question,
                description: q.description,
                image: q.image,
            })),
        };

       
    };

    return (
        <div className={styles.questionnaireSettings}>
            <h2>Create Questionnaire</h2>

            <div className={styles.section}>
                <h3>Questionnaire Details</h3>
                
            </div>

            <div className={styles.footer}>
                <button className={styles.saveButton} onClick={handleSave}>
                    Create Questionnaire
                </button>
                <button className={styles.cancelButton} onClick={()=>console.log('Cancel')}>
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default QuestionnaireSettings;