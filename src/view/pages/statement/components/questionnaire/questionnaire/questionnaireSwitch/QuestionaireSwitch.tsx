import { QuestionnaireQuestion, Statement } from 'delib-npm';
import React from 'react'
import QuestionPage from '../../../statementTypes/question/QuestionPage';

interface Props {
    currentQuestion: QuestionnaireQuestion | undefined;
    currentQuestionStatement?: Statement;
}

const QuestionaireSwitch = ({ currentQuestion, currentQuestionStatement }: Props) => {

    if (!currentQuestion) {
        return (
            <div className="empty-state">
                <p>No question available</p>
            </div>
        );
    }
    
    // If we have a statementId but no statement loaded yet, show loading
    // But if there's no statementId, we can still show the question from QuestionnaireQuestion data
    if (currentQuestion.statementId && !currentQuestionStatement) {
        console.info('Waiting for statement to load for question:', currentQuestion);
        // We can still show the question with the data we have
        // return (
        //     <div className="loading">
        //         <p>Loading question...</p>
        //     </div>
        // );
    }

    return (
        <div className="questionnaire-question">
            <QuestionPage question={currentQuestion} />
        </div>
    )
}

export default QuestionaireSwitch