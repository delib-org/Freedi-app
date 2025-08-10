import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { statementSelectorById } from "@/redux/statements/statementsSlice";
import { useSelector } from "react-redux";
import { useParams } from "react-router";
import QuestionaireSwitch from "./questionnaireSwitch/QuestionaireSwitch";
import StatementHeader from "../../header/StatementHeader";

const Questionnaire = () => {
    const {statementId} = useParams<{ statementId: string }>();
    const statement = useSelector(statementSelectorById(statementId));
    const parentStatement = useSelector(statementSelectorById(statement?.parentId));
    const topParentStatement = useSelector(statementSelectorById(parentStatement?.topParentId));
    const {t} = useUserConfig();
    return (
        <div>
            <StatementHeader statement={statement} parentStatement={parentStatement} topParentStatement={topParentStatement} isMindMap={false} isConsensusMap={false} isCollaborationMap={false} />
            <h1>Questionnaire</h1>
            {statement && (
                <div>
                    <h2>{statement.statement}</h2>
                    <p>{statement.description}</p>
                </div>
            )}
            <QuestionaireSwitch />
            <div className="btns">
                <button className="btn btn--secondary">{t('Back')}</button>
                <button className="btn btn--primary">{t('Next')}</button>
            </div>
        </div>
    );
};

export default Questionnaire;