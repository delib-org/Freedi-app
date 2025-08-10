import { QuestionnaireQuestion } from 'delib-npm';
import React from 'react'

interface Props {
    currentQuestion: QuestionnaireQuestion | undefined;
}

const QuestionaireSwitch = ({ currentQuestion }: Props) => {

    if (!currentQuestion) return null;

    return (
        <div>{currentQuestion.question}</div>
    )
}

export default QuestionaireSwitch