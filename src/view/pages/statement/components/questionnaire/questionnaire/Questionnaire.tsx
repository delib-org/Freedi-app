import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { statementSelectorById } from "@/redux/statements/statementsSlice";
import { useSelector } from "react-redux";
import { useParams } from "react-router";

const Questionnaire = () => {
    const {statementId} = useParams<{ statementId: string }>();
    const statement = useSelector(statementSelectorById(statementId));
    const {t} = useUserConfig();
    return (
        <div>
            <h1>Questionnaire</h1>
            {statement && (
                <div>
                    <h2>{statement.statement}</h2>
                    <p>{statement.description}</p>
                </div>
            )}
            <div className="btns">
                <button className="btn btn--secondary">{t('Back')}</button>
                <button className="btn btn--primary">{t('Next')}</button>
            </div>
        </div>
    );
};

export default Questionnaire;