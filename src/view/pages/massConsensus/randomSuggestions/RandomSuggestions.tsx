import SimpleSuggestionCards from "../../statement/components/evaluations/components/simpleSuggestionCards/SimpleSuggestionCards";
import FooterMassConsensus from "../footerMassConsensus/FooterMassConsensus";
import { useRandomSuggestions } from "./RandomSuggestionsVM";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { useHeader } from "../headerMassConsensus/HeaderContext";
import { useEffect } from "react";
import Loader from "@/view/components/loaders/Loader";
import { useMassConsensusAnalytics } from "@/hooks/useMassConsensusAnalytics";
import { useSelector } from "react-redux";
import { numberOfEvaluatedStatements } from "@/redux/evaluations/evaluationsSlice";

const RandomSuggestions = () => {
  const { navigateToTop, loadingStatements, subStatements, statement} = useRandomSuggestions();
  const { t } = useUserConfig();
  const { trackStageCompleted, trackStageSkipped } =
    useMassConsensusAnalytics();

  const { setHeader } = useHeader();
  const listOfStatementsIds = subStatements.map(st => st.statementId);
  const evaluationsLeft = useSelector(numberOfEvaluatedStatements(listOfStatementsIds));

  useEffect(() => {
    setHeader({
      title: t("General suggestion evaluation"),
      backToApp: false,
      isIntro: false,
    });
  }, []);

  return (
    <>
    <h1>{t("Question")}: {statement?.statement}</h1>
      <h3>{t("Please rate the following suggestions")}</h3>
      {loadingStatements ? (
        <div style={{margin:"0 auto",padding:"1rem"}}>
          <Loader />
        </div>
      ) : (
        <SimpleSuggestionCards
          subStatements={subStatements}
        />
      )}
      
      <FooterMassConsensus
        isNextActive={evaluationsLeft === 0}
        canSkip={false}
        evaluationsLeft={evaluationsLeft}
        onNext={() => {
          trackStageCompleted("random_suggestions");
          navigateToTop();
        }}
        onSkip={() => trackStageSkipped("random_suggestions")}
      />
    </>
  );
};

export default RandomSuggestions;
