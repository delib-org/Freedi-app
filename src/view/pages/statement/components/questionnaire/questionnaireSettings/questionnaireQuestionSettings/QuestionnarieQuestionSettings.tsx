import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { statementSelectorById, subQuestionsSelector } from '@/redux/statements/statementsSlice';
import { RootState } from '@/redux/store';
import { CutoffBy, EvaluationUI, QuestionnaireQuestion, QuestionType, Statement, StatementType } from 'delib-npm';
import React from 'react'
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './QuestionnaireQuestionSettings.module.scss';

interface Props {
  setQuestion: (question: QuestionnaireQuestion) => void;
}

const QuestionnaireQuestionSettings: React.FC<Props> = ({ setQuestion }) => {
  const { t } = useUserConfig();
  const {statementId} = useParams<{ statementId: string }>();
  const statement = useSelector(statementSelectorById(statementId)) as Statement;
  const subQuestions = useSelector(subQuestionsSelector(statement?.parentId));

  return (
    <div>
      <h4>{t("Question Settings")}</h4>
      <form className={styles.form}>
        <input type="text" name="question" id="question" placeholder={t("Enter your question")} />
         <textarea name="description" id="description" placeholder={t("Enter question description (optional)")}></textarea>
        <select name="statement" id="statement" defaultValue="none">
          <option value="none" disabled className='select--disabled'>{t("Select Question question")}</option>
          <option value="new">{t("New question")}</option>
          {subQuestions.map((subStatement: Statement) => (
            <option key={subStatement.statementId} value={subStatement.statementId}>
              {subStatement.statement}
            </option>
          ))}
        </select>
        <select name="questionType" id="questionType" defaultValue="none">
          <option value="none" disabled>{t("Select Question Type")}</option>
          <option value={QuestionType.simple}>{t("Simple Question")}</option>
          <option value={QuestionType.massConsensus}>{t("Mass Consensus")}</option>
        </select>
        <select name="evaluationUI" id="evaluationUI" defaultValue="none">
          <option value="none" disabled>{t("Select Evaluation UI")}</option>
          <option value={EvaluationUI.suggestions}>{t('Suggestions')}</option>
          <option value={EvaluationUI.voting}>{t('Voting')}</option>
        </select>
        <select name="cutoffBy" id="cutoffBy" defaultValue="none">
          <option value="none" disabled>{t("Select Cutoff By")}</option>
          <option value={CutoffBy.aboveThreshold}>{t("Above Threshold")}</option>
          <option value={CutoffBy.topOptions}>{t("Top Options")}</option>
        </select>
        <input type="number" name="cutoffValue" id="cutoffValue" placeholder={t("Enter cutoff value")} />
      </form>
    </div>
  )
}

export default QuestionnaireQuestionSettings