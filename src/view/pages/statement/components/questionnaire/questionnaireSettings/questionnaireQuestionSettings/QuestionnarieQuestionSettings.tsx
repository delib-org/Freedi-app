import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { setStatement, statementSelectorById, subQuestionsSelector } from '@/redux/statements/statementsSlice';
import { RootState } from '@/redux/store';
import { CutoffBy, EvaluationUI, getRandomUID, QuestionnaireQuestion, QuestionType, ResultsBy, Statement, StatementType } from 'delib-npm';
import React, { useEffect } from 'react'
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './QuestionnaireQuestionSettings.module.scss';
import SavedIcon from '@/assets/icons/checkIcon.svg?react';
import { deleteQuestionnaireQuestion, setQuestionnaireQuestion } from '@/controllers/db/questionnaries/setQuestionnairs';
import { saveStatementToDB, setStatementToDB } from '@/controllers/db/statements/setStatements';
import { stat } from 'fs';

interface Props {
  setQuestion: (question: QuestionnaireQuestion) => void;
  question?: QuestionnaireQuestion ;
}

const QuestionnaireQuestionSettings: React.FC<Props> = ({ setQuestion, question }) => {

  const { t } = useUserConfig();
  const { statementId } = useParams<{ statementId: string }>();
  const statement = useSelector(statementSelectorById(statementId)) as Statement;
  const subQuestions = useSelector(subQuestionsSelector(statement?.parentId));
  

  const [showQuestion, setShowQuestion] = React.useState<boolean>(true);
  const [isDeleting, setIsDeleting] = React.useState<boolean>(false);
  const [_question, setQuestionText] = React.useState<string | null>(question?.question || null);
  const [description, setDescription] = React.useState<string | null>(question?.description || null);
  const [questionType, setQuestionType] = React.useState<QuestionType | null>(question?.questionType || null);
  const [evaluationUI, setEvaluationUI] = React.useState<EvaluationUI | null>(question?.evaluationUI || null);

  const [cutoffBy, setCutoffBy] = React.useState<CutoffBy | null>(null);
  const [save, setSave] = React.useState<boolean>(false);
  const [canSave, setCanSave] = React.useState<boolean>(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSave(true);
    const formData = new FormData(event.currentTarget);
    const dataObj = Object.fromEntries(formData.entries());

    const newStatementId = dataObj.statement === 'new' ? getRandomUID() : question?.statementId || getRandomUID();

    if (dataObj.statement === 'new') {
      //save new statement to the database
      if (!statement?.parentId) throw new Error('Parent ID is required for new statements');

      console.log('Creating new statement with ID:', newStatementId);


      await _createNewStatement(newStatementId);



    }

    const newQuestionData = {
      statementId: newStatementId,
      question:_question || '',
      description,
      questionType,
      evaluationUI: evaluationUI,
      cutoffBy,
      order: subQuestions.length + 1,
      questionnaireQuestionId: question?.questionnaireQuestionId || getRandomUID(),
    };

    setQuestionnaireQuestion(
      {
        questionnaireId: statementId,
        questionnaireQuestion: newQuestionData
      }
    );

    // If this is a new question (not editing), trigger the animation
    if (!question) {
      setQuestion(newQuestionData);
    }




    async function _createNewStatement(newStatementId: string): Promise<Statement> {
      const newStatement: Statement = {
        statementId: newStatementId,
        consensus: 0,
        topParentId: statement?.topParentId || statementId,
        parents: [...statement.parents, statementId],
        creatorId: statement?.creatorId,
        creator: statement?.creator,
        lastUpdate: Date.now(),
        createdAt: Date.now(),
        statement: dataObj.question as string,
        description: dataObj.description as string,
        parentId: statement?.statementId || '',
        statementType: StatementType.question,
        questionSettings: {
          questionType: dataObj.questionType as QuestionType,
        },
        resultsSettings: {
          resultsBy: ResultsBy.consensus,
          cutoffBy: dataObj.cutoffBy as CutoffBy,
          cutoffNumber: dataObj.cutoffValue ? parseFloat(dataObj.cutoffValue as string) : undefined,
          numberOfResults: dataObj.cutoffValue ? parseInt(dataObj.cutoffValue as string, 10) : undefined,
        },
        evaluationSettings: {
          evaluationUI: dataObj.evaluationUI as EvaluationUI,
        }
      };
      const { statement: newStatementFrmDB } = await setStatementToDB({
        statement: newStatement,
        parentStatement: statement,
      });
      return newStatementFrmDB;
    }
  }

  function handleDelete() {
    if (question) {
      // Ask for confirmation before deleting
      const confirmDelete = window.confirm(t("Are you sure you want to delete this question? This action cannot be undone."));
      
      if (!confirmDelete) {
        return;
      }
      
      // Start the animation
      setIsDeleting(true);
      
      // Wait for animation to complete before actually deleting
      setTimeout(() => {
        deleteQuestionnaireQuestion({
          questionnaireId: statementId,
          questionnaireQuestionId: question.questionnaireQuestionId,
        }).then(() => {
          setShowQuestion(false);
        }).catch(error => {
          console.error('Error deleting questionnaire question:', error);
          // Reset deleting state if there's an error
          setIsDeleting(false);
        });
      }, 500); // Match the animation duration
    }
  }

  useEffect(() => {
    setSave(false);
    if (_question && questionType && evaluationUI && cutoffBy) setCanSave(true);
  }, [_question, description, questionType, evaluationUI, cutoffBy]);

  if (!showQuestion) return null;

  return (
    <div className={`${styles.questionContainer} ${isDeleting ? styles.deleting : ''}`}>
      <h4>{t("Question Settings")}</h4>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input type="text" name="question" id="question" placeholder={t("Enter your question")} onChange={(e) => setQuestionText(e.target.value)} defaultValue={question?.question || ''} />
        <textarea name="description" id="description" placeholder={t("Enter question description (optional)")} onChange={(e) => setDescription(e.target.value)} defaultValue={question?.description || ''}></textarea>
        <select name="statement" id="statement" defaultValue="none">
          <option value="none" disabled className='select--disabled'>{t("Select Question question")}</option>
          <option value="new">{t("New question")}</option>
          {subQuestions.map((subStatement: Statement) => (
            <option key={subStatement.statementId} value={subStatement.statementId}>
              {subStatement.statement}
            </option>
          ))}
        </select>
        <select name="questionType" id="questionType" defaultValue={question?.questionType || 'none'} onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
          <option value="none" disabled>{t("Select Question Type")}</option>
          <option value={QuestionType.simple}>{t("Simple Question")}</option>
          <option value={QuestionType.massConsensus}>{t("Mass Consensus")}</option>
        </select>
        <select name="evaluationUI" id="evaluationUI" defaultValue={question?.evaluationUI || 'none'} onChange={(e) => setEvaluationUI(e.target.value as EvaluationUI)}>
          <option value="none" disabled>{t("Select Evaluation UI")}</option>
          <option value={EvaluationUI.suggestions}>{t('Suggestions')}</option>
          <option value={EvaluationUI.voting}>{t('Voting')}</option>
        </select>
        <select name="cutoffBy" id="cutoffBy" defaultValue={question?.cutoffBy || 'none'} onChange={(e) => setCutoffBy(e.target.value as CutoffBy)}>
          <option value="none" disabled>{t("Select Cutoff By")}</option>
          <option value={CutoffBy.aboveThreshold}>{t("Above Threshold")}</option>
          <option value={CutoffBy.topOptions}>{t("Top Options")}</option>
        </select>
        {cutoffBy && cutoffBy === CutoffBy.topOptions && (
          <input type="number" name="cutoffValue" step={1} id="cutoffValue" placeholder={t("How many options to include")} />
        )}
        {cutoffBy && cutoffBy === CutoffBy.aboveThreshold && (
          <input type="number" name="cutoffValue" step={0.001} id="cutoffValue" placeholder={t("Enter cutoff value")} />
        )}
        <div className="btns">
          <button type="button" className={`btn btn--secondary btn--danger ${styles.cancelButton}`} onClick={handleDelete}>{t("Delete")}</button>
        <button type="submit" disabled={!canSave} className={`btn ${canSave ? "btn--active" : "btn--disabled"} ${styles.saveButton}`}>{t(save ? "Changes Saved" : "Save Changes")} {save && <SavedIcon />}</button>
        </div>
      </form>
    </div>
  )
}

export default QuestionnaireQuestionSettings