import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { statementSelectorById } from "@/redux/statements/statementsSlice";
import { useSelector } from "react-redux";
import { useParams } from "react-router";
import QuestionaireSwitch from "./questionnaireSwitch/QuestionaireSwitch";
import StatementHeader from "../../header/StatementHeader";
import { QuestionnaireQuestion } from "delib-npm";
import { useState } from "react";

const Questionnaire = () => {
    const { statementId } = useParams<{ statementId: string }>();
    const statement = useSelector(statementSelectorById(statementId));
    const parentStatement = useSelector(statementSelectorById(statement?.parentId));
    const topParentStatement = useSelector(statementSelectorById(parentStatement?.topParentId));
    const questions: QuestionnaireQuestion[] = Object.values(statement?.questionnaire?.questions || {});
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const currentQuestion = questions[currentQuestionIndex];

    const { t } = useUserConfig();
    return (
        <div>
            <StatementHeader statement={statement} parentStatement={parentStatement} topParentStatement={topParentStatement} isMindMap={false} isConsensusMap={false} isCollaborationMap={false} />
            <div className="wrapper">
                <h1>Questionnaire</h1>
                {statement && (
                    <div>
                        <h2>{statement.statement}</h2>
                        <p>{statement.description}</p>
                    </div>
                )}
                <QuestionaireSwitch currentQuestion={currentQuestion} />
                <div className="btns">
                    {currentQuestionIndex > 0 && (
                        <button className="btn btn--secondary">{t('Back')}</button>
                    )}
                    {currentQuestionIndex < questions.length - 1 && (
                        <button className="btn btn--primary">{t('Next')}</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Questionnaire;