import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { statementSelectorById, setStatement } from "@/redux/statements/statementsSlice";
import { useSelector, useDispatch } from "react-redux";
import { useParams } from "react-router";
import QuestionaireSwitch from "./questionnaireSwitch/QuestionaireSwitch";
import StatementHeader from "../../header/StatementHeader";
import { QuestionnaireQuestion } from "delib-npm";
import { useState, useContext, useMemo, useEffect } from "react";
import { StatementContext } from "../../../StatementCont";
import { getStatementFromDB } from "@/controllers/db/statements/getStatement";
import styles from "./Questionnaire.module.scss";

const Questionnaire = () => {
    const dispatch = useDispatch();
    const { questionnaireId } = useParams<{ questionnaireId: string }>();
    const questionnaire = useSelector(statementSelectorById(questionnaireId));
    const parentStatement = useSelector(statementSelectorById(questionnaire?.parentId));
    const topParentStatement = useSelector(statementSelectorById(parentStatement?.topParentId || questionnaire?.topParentId));
    
    // Sort questions by order
    const questions: QuestionnaireQuestion[] = useMemo(() => {
        const questionsArray = Object.values(questionnaire?.questionnaire?.questions || {});
        return questionsArray.sort((a, b) => (a.order || 0) - (b.order || 0));
    }, [questionnaire?.questionnaire?.questions]);
    
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const currentQuestion = questions[currentQuestionIndex];
    
    // Get the actual Statement for the current question
    const currentQuestionStatement = useSelector(
        statementSelectorById(currentQuestion?.statementId)
    );
    
    // Load question statement if not in store
    useEffect(() => {
        const loadQuestionStatement = async () => {
            if (currentQuestion?.statementId && !currentQuestionStatement) {
                console.info('Loading question statement:', currentQuestion.statementId);
                const statement = await getStatementFromDB(currentQuestion.statementId);
                if (statement) {
                    console.info('Statement fetched from DB:', statement);
                    dispatch(setStatement(statement));
                } else {
                    console.error('No statement found for ID:', currentQuestion.statementId);
                }
            }
        };
        
        loadQuestionStatement();
        
        if (currentQuestionStatement) {
            console.info('Question statement loaded:', {
                statementId: currentQuestionStatement.statementId,
                statement: currentQuestionStatement.statement,
                description: currentQuestionStatement.description
            });
        }
    }, [currentQuestion?.statementId, currentQuestionStatement, dispatch]);
    
    const { t } = useUserConfig();
    const parentContext = useContext(StatementContext);
    
    // Navigation handlers
    const handleNext = () => {
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };
    
    const handleBack = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };
    
    // Create enhanced context with current question info
    const enhancedContext = useMemo(() => ({
        ...parentContext,
        statement: currentQuestionStatement || questionnaire, // Use question statement if available
        currentQuestion,
        currentQuestionStatement,
    }), [parentContext, currentQuestionStatement, questionnaire, currentQuestion]);
    
    if (!questionnaire) {
        return <div className="wrapper">Loading questionnaire...</div>;
    }
    
    if (questions.length === 0) {
        return (
            <div className="wrapper">
                <StatementHeader 
                    statement={questionnaire} 
                    parentStatement={parentStatement} 
                    topParentStatement={topParentStatement} 
                />
                <h1>{t('Questionnaire')}</h1>
                <p>{t('No questions available in this questionnaire.')}</p>
            </div>
        );
    }
    
    return (
        <StatementContext.Provider value={enhancedContext}>
            <div className="page">
                <StatementHeader 
                    statement={questionnaire} 
                    parentStatement={parentStatement} 
                    topParentStatement={topParentStatement} 
                />
                <div className="wrapper">
                    <div className={styles.questionnaireHeader}>
                        <h1>{questionnaire.statement}</h1>
                        {questionnaire.description && (
                            <p className={styles.description}>{questionnaire.description}</p>
                        )}
                        <div className={styles.progress}>
                            <span>{t('Question')} {currentQuestionIndex + 1} {t('of')} {questions.length}</span>
                            <div className={styles.progressBar}>
                                <div 
                                    className={styles.progressFill} 
                                    style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    
                    <QuestionaireSwitch 
                        currentQuestion={currentQuestion} 
                        currentQuestionStatement={currentQuestionStatement}
                    />
                    
                    <div className="btns">
                        <button 
                            className="btn btn--secondary"
                            onClick={handleBack}
                            disabled={currentQuestionIndex === 0}
                        >
                            {t('Back')}
                        </button>
                        <button 
                            className="btn btn--primary"
                            onClick={handleNext}
                            disabled={currentQuestionIndex >= questions.length - 1}
                        >
                            {currentQuestionIndex === questions.length - 1 ? t('Finish') : t('Next')}
                        </button>
                    </div>
                </div>
            </div>
        </StatementContext.Provider>
    );
};

export default Questionnaire;