import SimpleSuggestionCards from "../../statement/components/evaluations/components/simpleSuggestionCards/SimpleSuggestionCards";
import FooterMassConsensus from "../footerMassConsensus/FooterMassConsensus";
import { useRandomSuggestions } from "./RandomSuggestionsVM";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { useHeader } from "../headerMassConsensus/HeaderContext";
import { useEffect, useState } from "react";
import Loader from "@/view/components/loaders/Loader";
import { useMassConsensusAnalytics } from "@/hooks/useMassConsensusAnalytics";
import { useSelector } from "react-redux";
import { numberOfEvaluatedStatements } from "@/redux/evaluations/evaluationsSlice";
import styles from "./RandomSuggestions.module.scss";
import RandomIcon from "@/assets/icons/randomIcon.svg?react";
import StageExplanation from "@/view/components/massConsensus/StageExplanation/StageExplanation";

const RandomSuggestions = () => {
  const { navigateToTop, loadingStatements, subStatements, statement, fetchRandomStatements} = useRandomSuggestions();
  const { t } = useUserConfig();
  const { trackStageCompleted, trackStageSkipped } =
    useMassConsensusAnalytics();
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handleGetNewSuggestions = async () => {
    setIsRefreshing(true);
    await fetchRandomStatements();
    setIsRefreshing(false);
  };

  return (
    <>
    {/* Show explanation for random suggestions stage */}
    <StageExplanation stageId="randomSuggestions" />

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

      {/* Get New Suggestions Button */}
      <div className={styles.batchControls}>
        <button
          className={`btn btn--secondary btn--img ${evaluationsLeft > 0 || isRefreshing ? 'btn--disabled' : ''}`}
          onClick={handleGetNewSuggestions}
          disabled={evaluationsLeft > 0 || isRefreshing}
          aria-label={t("Get new suggestions")}
        >
          <RandomIcon />
          <span>{t("Get New Suggestions")}</span>
        </button>
        {evaluationsLeft > 0 && (
          <p className={styles.hint}>
            {t("Evaluate all suggestions to get new ones")}
          </p>
        )}
      </div>

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
