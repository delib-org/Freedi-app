import { MassConsensusPageUrls } from "@/types/enums";
import SuggestionCards from "../../statement/components/evaluations/components/suggestionCards/SuggestionCards";
import HeaderMassConsensus from "../headerMassConsensus/HeaderMassConsensus";
import useTopSuggestions from "./TopSuggestionVM";
import { Link } from "react-router";
import { useParamsLanguage } from "../useParamsLang/UseParamsLanguge";

const TopSuggestions = () => {
    const { suggestions, statementId } = useTopSuggestions();
    const { lang } = useParamsLanguage();

    return (
        <div>
            <HeaderMassConsensus backTo={MassConsensusPageUrls.randomSuggestions} />
            <h2>please rate the top suggestions</h2>
            <SuggestionCards outerSubStatement={suggestions} />
            <div className="btns">
                <Link to={`/mass-consensus/${statementId}/${MassConsensusPageUrls.voting}?lang=${lang}`}>
                    <button className="btn btn--agree">skip</button>
                </Link>
                <Link to={`/mass-consensus/${statementId}/${MassConsensusPageUrls.voting}?lang=${lang}`}>
                    <button className="btn btn--agree">next</button>
                </Link>
            </div>
        </div>
    )
}

export default TopSuggestions;