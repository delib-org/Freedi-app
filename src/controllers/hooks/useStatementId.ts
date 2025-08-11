import { useParams } from 'react-router';
import { useContext } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';

/**
 * Custom hook to get the correct statementId whether in a regular statement page
 * or within a questionnaire viewing a specific question.
 * 
 * Priority:
 * 1. If statementId is in URL params → use it (normal statement page)
 * 2. If in questionnaire and currentQuestion exists → use question's statementId
 * 3. Otherwise → use questionnaireId (viewing questionnaire itself)
 */
export const useStatementId = (): string | undefined => {
  const { statementId, questionnaireId } = useParams<{ 
    statementId?: string; 
    questionnaireId?: string;
  }>();
  
  const context = useContext(StatementContext);
  
  // Normal statement page
  if (statementId) {
    return statementId;
  }
  
  // In questionnaire mode with a current question
  if (questionnaireId && context?.currentQuestion?.statementId) {
    return context.currentQuestion.statementId;
  }
  
  // Viewing questionnaire itself or fallback
  return questionnaireId;
};