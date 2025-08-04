import { QuestionnaireQuestion } from 'delib-npm';
import React from 'react'

interface Props{
    setQuestion: (question: QuestionnaireQuestion) => void;
}

const QuestionnaireQuestionSettings: React.FC<Props> = ({ setQuestion }) => {
  return (
    <div>
      <h4>Question Settings</h4>
      <form>
        <input type="text" name="question" id="question" />
        <textarea name="description" id="description"></textarea>
      </form>
    </div>
  )
}

export default QuestionnaireQuestionSettings