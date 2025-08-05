import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { statementSelectorById, subQuestionsSelector } from '@/redux/statements/statementsSlice';
import { CutoffBy, EvaluationUI, getRandomUID, QuestionnaireQuestion, QuestionType, ResultsBy, Statement, StatementType } from 'delib-npm';
import React, { useEffect } from 'react'
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './QuestionnaireQuestionSettings.module.scss';
import SavedIcon from '@/assets/icons/checkIcon.svg?react';
import { deleteQuestionnaireQuestion, setQuestionnaireQuestion } from '@/controllers/db/questionnaries/setQuestionnairs';
import { setStatementToDB } from '@/controllers/db/statements/setStatements';
import { logger } from '@/services/logger/logger';

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

  const [cutoffBy, setCutoffBy] = React.useState<CutoffBy | null>(question?.cutoffBy || null);
  const [save, setSave] = React.useState<boolean>(false);
  const [canSave, setCanSave] = React.useState<boolean>(false);
  
  // Store original values for change detection
  const [originalValues] = React.useState({
    question: question?.question || null,
    description: question?.description || null,
    questionType: question?.questionType || null,
    evaluationUI: question?.evaluationUI || null,
    cutoffBy: question?.cutoffBy || null,
    statementId: question?.statementId || null
  });
  const [selectedStatement, setSelectedStatement] = React.useState<string>(question?.statementId || 'none');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSave(true);
    
    try {
      const formData = new FormData(event.currentTarget);
      const dataObj = Object.fromEntries(formData.entries());

      const newStatementId = selectedStatement === 'new' ? getRandomUID() : selectedStatement || question?.statementId || getRandomUID();

      if (selectedStatement === 'new') {
        //save new statement to the database
        if (!statement?.parentId) {
          throw new Error('Parent ID is required for new statements');
        }

        await _createNewStatement(newStatementId, dataObj);
      }

    const newQuestionData = {
      statementId: newStatementId,
      question:_question || '',
      description,
      questionType,
      evaluationUI: evaluationUI,
      cutoffBy,
      order: question?.order || 999,
      questionnaireQuestionId: question?.questionnaireQuestionId || getRandomUID(),
    };

      setQuestionnaireQuestion(
        {
          questionnaireId: statementId,
          questionnaireQuestion: newQuestionData
        }
      );

      // If this is a new question (not editing), trigger the animation
      if (!question || !question.questionnaireQuestionId) {
        setQuestion(newQuestionData);
        
        // Reset form for new question
        setTimeout(() => {
          setSave(false);
          setQuestionText('');
          setDescription('');
          setQuestionType(null);
          setEvaluationUI(null);
          setCutoffBy(null);
          setSelectedStatement('none');
          setCanSave(false);
        }, 1000); // Wait a bit to show the "saved" state
      }
    } catch (error) {
      logger.error('Error saving question:', error);
      setSave(false);
    }
  }

  async function _createNewStatement(newStatementId: string, dataObj: { [key: string]: FormDataEntryValue }): Promise<Statement> {
    const newStatement: Statement = {
      statementId: newStatementId,
      consensus: 0,
      topParentId: statement?.topParentId || statementId,
      parents: [...statement.parents, statementId],
      creatorId: statement?.creatorId,
      creator: statement?.creator,
      lastUpdate: Date.now(),
      createdAt: Date.now(),
      statement: _question || '',
      description: description || '',
      parentId: statement?.statementId || '',
      statementType: StatementType.question,
      questionSettings: {
        questionType: questionType || QuestionType.simple,
      },
      resultsSettings: {
        resultsBy: ResultsBy.consensus,
        cutoffBy: cutoffBy || CutoffBy.topOptions,
        ...(cutoffBy === CutoffBy.aboveThreshold && dataObj.cutoffValue 
          ? { cutoffNumber: parseFloat(dataObj.cutoffValue as string) }
          : {}),
        ...(cutoffBy === CutoffBy.topOptions && dataObj.cutoffValue
          ? { numberOfResults: parseInt(dataObj.cutoffValue as string, 10) }
          : {}),
      },
      evaluationSettings: {
        evaluationUI: evaluationUI || EvaluationUI.voting,
      }
    };
    const result = await setStatementToDB({
      statement: newStatement,
      parentStatement: statement,
    });
    
    if (!result || !result.statement) {
      throw new Error('Failed to create statement');
    }
    
    return result.statement;
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
    
    // Check if all required fields are filled
    const requiredFieldsFilled = !!(_question && questionType && evaluationUI && cutoffBy);
    
    if (!question) {
      // For new questions, enable save when required fields are filled
      setCanSave(requiredFieldsFilled);
    } else {
      // For existing questions, check if any values have changed from the original
      const hasChanges = 
        _question !== originalValues.question ||
        description !== originalValues.description ||
        questionType !== originalValues.questionType ||
        evaluationUI !== originalValues.evaluationUI ||
        cutoffBy !== originalValues.cutoffBy ||
        selectedStatement !== originalValues.statementId;
      
      // Enable save button if required fields are filled AND there are changes
      setCanSave(requiredFieldsFilled && hasChanges);
    }
  }, [_question, description, questionType, evaluationUI, cutoffBy, selectedStatement, originalValues, question]);

  if (!showQuestion) return null;

  return (
    <div className={`${styles.questionContainer} ${isDeleting ? styles.deleting : ''}`}>
      <h4>{t("Question Settings")}</h4>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input type="text" name="question" id="question" placeholder={t("Enter your question")} onChange={(e) => setQuestionText(e.target.value)} value={_question || ''} />
        <textarea name="description" id="description" placeholder={t("Enter question description (optional)")} onChange={(e) => setDescription(e.target.value)} value={description || ''}></textarea>
        <label htmlFor="statement">{t("Question")}</label>
        <select name="statement" id="statement" value={selectedStatement} onChange={(e) => setSelectedStatement(e.target.value)}>
          <option value="none" disabled className='select--disabled'>{t("Select Question question")}</option>
          <option value="new">{t("New question")}</option>
          {subQuestions.map((subStatement: Statement) => (
            <option key={subStatement.statementId} value={subStatement.statementId}>
              {subStatement.statement}
            </option>
          ))}
        </select>
        <label htmlFor="questionType">{t("Question Type")}</label>
        <select name="questionType" id="questionType" value={questionType || 'none'} onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
          <option value="none" disabled>{t("Select Question Type")}</option>
          <option value={QuestionType.simple}>{t("Simple Question")}</option>
          <option value={QuestionType.massConsensus}>{t("Mass Consensus")}</option>
        </select>
        <label htmlFor="evaluationUI">{t("Evaluation UI")}</label>
        <select name="evaluationUI" id="evaluationUI" value={evaluationUI || 'none'} onChange={(e) => setEvaluationUI(e.target.value as EvaluationUI)}>
          <option value="none" disabled>{t("Select Evaluation UI")}</option>
          <option value={EvaluationUI.suggestions}>{t('Suggestions')}</option>
          <option value={EvaluationUI.voting}>{t('Voting')}</option>
        </select>
        <label htmlFor="cutoffBy">{t("Cutoff By")}</label>
        <select name="cutoffBy" id="cutoffBy" value={cutoffBy || 'none'} onChange={(e) => setCutoffBy(e.target.value as CutoffBy)}>
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