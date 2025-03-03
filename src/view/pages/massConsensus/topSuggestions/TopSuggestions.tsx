import { MassConsensusPageUrls, SortType } from "@/types/TypeEnums";
import SuggestionCards from "../../statement/components/evaluations/components/suggestionCards/SuggestionCards";
import HeaderMassConsensus from "../headerMassConsensus/HeaderMassConsensus";
import useTopSuggestions from "./TopSuggestionVM";
import TitleMassConsensus from "../TitleMassConsensus/TitleMassConsensus";
import FooterMassConsensus from "../footerMassConsensus/FooterMassConsensus";
import { SelectionFunction } from "@/types/evaluation/Evaluation";
import { useLanguage } from "@/controllers/hooks/useLanguages";

const TopSuggestions = () => {
    const { t } = useLanguage();
	const { navigateToVoting } = useTopSuggestions();

    return (
        <div>
            <HeaderMassConsensus title={t("leading suggestion evaluation")} backTo={MassConsensusPageUrls.randomSuggestions} />
            <TitleMassConsensus title={t("please rate the following suggestions")} />
            <div className="wrapper">
                <SuggestionCards selectionFunction={SelectionFunction.top} propSort={SortType.random}  />
            </div>
            <FooterMassConsensus isNextActive={true} onNext={navigateToVoting} goTo={MassConsensusPageUrls.voting}/>
        </div>
    )
}

export default TopSuggestions;
