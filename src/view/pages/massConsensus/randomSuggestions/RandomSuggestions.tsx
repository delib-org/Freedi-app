import SimpleSuggestionCards from "../../statement/components/evaluations/components/simpleSuggestionCards/SimpleSuggestionCards";
import FooterMassConsensus from "../footerMassConsensus/FooterMassConsensus";
import { useRandomSuggestions } from "./RandomSuggestionsVM";
import { useEvaluationTracking } from "./useEvaluationTracking";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { useHeader } from "../headerMassConsensus/HeaderContext";
import { useEffect, useState } from "react";
import Loader from "@/view/components/loaders/Loader";
import { useMassConsensusAnalytics } from "@/hooks/useMassConsensusAnalytics";
import { useSelector } from "react-redux";
import { numberOfEvaluatedStatements } from "@/redux/evaluations/evaluationsSlice";
import styles from "./RandomSuggestions.module.scss";
import RandomIcon from "@/assets/icons/randomIcon.svg?react";
import StageExplanationScreen from "@/view/components/massConsensus/StageExplanationScreen/StageExplanationScreen";
import { useExplanations } from "@/contexts/massConsensus/ExplanationProvider";
import { useParams } from "react-router";

const RandomSuggestions = () => {
  const {
    navigateToTop,
    loadingStatements,
    subStatements,
    statement,
    fetchRandomStatements,
    canGetNewSuggestions,
    isLoadingNew,
    currentBatch,
    totalBatchesViewed,
    cyclesCompleted,
    showRecycleMessage,
    allSuggestionsViewed,
    handleDismissRecycleMessage
  } = useRandomSuggestions();
  const { t } = useUserConfig();
  const { statementId } = useParams<{ statementId: string }>();
  const { trackStageCompleted, trackStageSkipped } =
    useMassConsensusAnalytics();
  const [showExplanation, setShowExplanation] = useState(true);
  const { hasSeenExplanation, getDontShowExplanations } = useExplanations();

  const { setHeader } = useHeader();
  const listOfStatementsIds = subStatements.map(st => st.statementId);
  const evaluationsLeft = useSelector(numberOfEvaluatedStatements(listOfStatementsIds));

  // Track evaluations for batch management
  useEvaluationTracking(listOfStatementsIds);

  useEffect(() => {
    setHeader({
      title: t("General suggestion evaluation"),
      backToApp: false,
      isIntro: false,
    });
  }, []);

  // Check if we should show explanation
  useEffect(() => {
    if (hasSeenExplanation('randomSuggestions') || getDontShowExplanations()) {
      setShowExplanation(false);
    }
  }, []);

  const handleGetNewSuggestions = async () => {
    await fetchRandomStatements();
  };

  // Show full-screen explanation if needed
  if (showExplanation) {
    return (
      <StageExplanationScreen
        stageId="randomSuggestions"
        onContinue={() => setShowExplanation(false)}
        previousStageUrl={`/mass-consensus/${statementId}/question`}
      />
    );
  }

  return (
    <>
    <h1>{t("Question")}: {statement?.statement}</h1>
      <h3>{t("Please rate the following suggestions")}</h3>

      {/* Batch indicator */}
      {totalBatchesViewed > 1 && (
        <div className={styles.batchIndicator}>
          {t("Batch")} {currentBatch + 1} {t("of suggestions")}
          {cyclesCompleted > 0 && (
            <span className={styles.cycleIndicator}>
              {" "}({t("Cycle")} {cyclesCompleted + 1})
            </span>
          )}
        </div>
      )}

      {/* Recycle message */}
      {showRecycleMessage && (
        <div className={styles.recycleMessage}>
          <div className={styles.recycleMessageContent}>
            <p>
              {cyclesCompleted === 1
                ? t("You've seen all available suggestions! Starting a new cycle...")
                : t("Starting cycle " + (cyclesCompleted + 1) + " of suggestions")}            </p>
            <button
              className="btn btn--text"
              onClick={handleDismissRecycleMessage}
              aria-label={t("Dismiss message")}
            >
              {t("Got it")}
            </button>
          </div>
        </div>
      )}

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
          className={`btn btn--secondary btn--img ${!canGetNewSuggestions || isLoadingNew ? 'btn--disabled' : ''}`}
          onClick={handleGetNewSuggestions}
          disabled={!canGetNewSuggestions || isLoadingNew}
          aria-label={t("Get new suggestions")}
        >
          {isLoadingNew ? (
            <>
              <Loader />
              <span>{t("Loading new suggestions...")}</span>
            </>
          ) : (
            <>
              <RandomIcon />
              <span>{t("Get New Suggestions")}</span>
            </>
          )}
        </button>
        {evaluationsLeft > 0 && (
          <p className={styles.hint}>
            {t("Evaluate all suggestions to get new ones")}
            {` (${evaluationsLeft} ${t("left")})`}
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
