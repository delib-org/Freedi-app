import { MassConsensusPageUrls, SortType } from "@/types/TypeEnums";
import SuggestionCards from "../../statement/components/evaluations/components/suggestionCards/SuggestionCards";
import HeaderMassConsensus from "../headerMassConsensus/HeaderMassConsensus";
import useTopSuggestions from "./TopSuggestionVM";
import TitleMassConsensus from "../TitleMassConsensus/TitleMassConsensus";
import FooterMassConsensus from "../footerMassConsesus/footerMassConsesus";
import { SelectionFunction } from "@/types/evaluation/Evaluation";

const TopSuggestions = () => {
	useTopSuggestions();

    return (
        <div>
            <HeaderMassConsensus title="leading suggestion evaluation" backTo={MassConsensusPageUrls.randomSuggestions} />
            <TitleMassConsensus title="please rate the top suggestions" />
            <SuggestionCards selectionFunction={SelectionFunction.top} propSort={SortType.random}  />
            <FooterMassConsensus goTo={MassConsensusPageUrls.voting}/>
        </div>
    )
}

export default TopSuggestions;
