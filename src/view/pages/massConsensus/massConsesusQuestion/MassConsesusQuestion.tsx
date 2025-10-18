import { useEffect, useRef, useState } from "react";
import Loader from "@/view/components/loaders/Loader";
import InitialQuestion from "./initialQuestion/InitialQuestion";
import useMassConsensusQuestion from "./MassConsensusQuestionVM";
import SimilarSuggestions from "./similarSuggestions/SimilarSuggestions";
import FooterMassConsensus from "../footerMassConsensus/FooterMassConsensus";
import { useMassConsensusAnalytics } from "@/hooks/useMassConsensusAnalytics";
import StageExplanationScreen from "@/view/components/massConsensus/StageExplanationScreen/StageExplanationScreen";
import { useParams, useNavigate } from "react-router";
import { ExplanationConfig } from "delib-npm";

import styles from "./MassConsesusQuestion.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";

const MassConsensusQuestion = () => {
  const {
    stage,
    setStage,
    handleNext,
    ifButtonEnabled,
    setIfButtonEnabled,
    reachedLimit,
    setReachedLimit,
  } = useMassConsensusQuestion();
  const { trackStageCompleted, trackSubmission, trackStageSkipped } =
    useMassConsensusAnalytics();

  const isBusy = stage === "loading" || stage === "submitting";
  const { t } = useUserConfig();
  const [showLoader, setShowLoader] = useState(false);
  const loaderStartRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();

  // State for showing explanation screen
  const [showExplanationScreen, setShowExplanationScreen] = useState(true);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Default explanation for question stage
  const questionExplanation: ExplanationConfig = {
    enabled: true,
    title: t("Share Your Suggestion"),
    content: t(
      "Submit your idea for this question. Your suggestion will be randomly shown to other participants for evaluation. Similar ideas will be grouped together."
    ),
    displayMode: "card",
    showOnlyFirstTime: true,
    dismissible: true,
  };

  // Check if we should show explanation screen
  useEffect(() => {
    // For testing, always show the explanation
    // Later we can check: if (hasSeenExplanation('question') || getDontShowExplanations())
    setShowExplanationScreen(true);
  }, []);

  useEffect(() => {
    if (isBusy) {
      loaderStartRef.current = Date.now();
      const showId = window.setTimeout(() => setShowLoader(true), 250);

      return () => window.clearTimeout(showId);
    } else {
      if (loaderStartRef.current !== null) {
        const elapsed = Date.now() - loaderStartRef.current;
        const wait = Math.max(0, 500 - elapsed);
        const hideId = window.setTimeout(() => setShowLoader(false), wait);
        loaderStartRef.current = null;

        return () => window.clearTimeout(hideId);
      }
      setShowLoader(false);
    }
  }, [isBusy]);
  // Track submission when stage changes from question to loading
  useEffect(() => {
    if (stage === "loading") {
      trackSubmission("answer");
    }
    // Don't show feedback immediately after submission
    // The feedback should only show after the user completes the similar suggestions stage
  }, [stage, trackSubmission]);

  const handleNextWithTracking = () => {
    if (stage === "suggestions") {
      trackStageCompleted("question");
    }
    handleNext();
  };

  const handleSuggestionSaved = () => {
    // Show success message briefly, then navigate
    setShowSuccessMessage(true);
    trackStageCompleted("question");
    setTimeout(() => {
      setShowSuccessMessage(false);
      navigate(`/mass-consensus/${statementId}/random-suggestions`);
    }, 2000);
  };

  const handleSkipWithTracking = () => {
    trackStageSkipped("question");
  };

  const nextActive = !isBusy && ifButtonEnabled;

  // Show full-screen explanation if needed
  if (showExplanationScreen && stage === "question") {
    return (
      <StageExplanationScreen
        stageId="question"
        explanation={questionExplanation}
        onContinue={() => setShowExplanationScreen(false)}
        previousStageUrl={`/mass-consensus/${statementId}/introduction`}
      />
    );
  }

  return (
    <>
      {stage === "question" || stage === "loading" ? (
        <InitialQuestion
          setReachedLimit={setReachedLimit}
          stage={stage}
          setStage={setStage}
          setIfButtonEnabled={setIfButtonEnabled}
        />
      ) : (
        <SimilarSuggestions
          stage={stage}
          setIfButtonEnabled={setIfButtonEnabled}
          onSuggestionSaved={handleSuggestionSaved}
        />
      )}

      {/* Show success message after submission */}
      {showSuccessMessage && (
        <div className={styles.successOverlay}>
          <div className={styles.successMessage}>
            <h2>{t("Your suggestion has been successfully added!")}</h2>
            <p>{t("Redirecting to next stage...")}</p>
          </div>
        </div>
      )}

      {showLoader && (
        <div
          className={styles.loaderOverlay}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <h2 className={styles.loaderText}>
            {t("Looking for similar suggestions... please wait.")}
          </h2>
          <Loader />
        </div>
      )}

      {reachedLimit ? (
        <FooterMassConsensus
          onNext={() => {}}
          isNextActive={false}
          blockNavigation={false}
        />
      ) : (
        <FooterMassConsensus
          onNext={handleNextWithTracking}
          isNextActive={nextActive}
          blockNavigation={true}
          onSkip={handleSkipWithTracking}
        />
      )}
    </>
  );
};

export default MassConsensusQuestion;
