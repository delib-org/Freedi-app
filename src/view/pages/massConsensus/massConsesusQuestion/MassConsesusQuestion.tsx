import Loader from "@/view/components/loaders/Loader";
import InitialQuestion from "./initialQuestion/InitialQuestion";
import useMassConsensusQuestion from "./MassConsensusQuestionVM";
import SimilarSuggestions from "./similarSuggestions/SimilarSuggestions";
import FooterMassConsensus from "../footerMassConsensus/FooterMassConsensus";
import { useMassConsensusAnalytics } from "@/hooks/useMassConsensusAnalytics";
import { useEffect } from "react";

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

  // Track submission when stage changes from question to loading
  useEffect(() => {
    if (stage === "loading") {
      trackSubmission("answer");
    }
  }, [stage, trackSubmission]);

  const handleNextWithTracking = () => {
    if (stage === "suggestions") {
      trackStageCompleted("question");
    }
    handleNext();
  };

  const handleSkipWithTracking = () => {
    trackStageSkipped("question");
  };

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
        />
      )}

      {stage === "loading" || (stage === "submitting" && <Loader />)}
      {reachedLimit ? (
        <FooterMassConsensus
          onNext={() => {}}
          isNextActive={false}
          blockNavigation={false}
        />
      ) : (
        <FooterMassConsensus
          onNext={handleNextWithTracking}
          isNextActive={ifButtonEnabled}
          blockNavigation={true}
          onSkip={handleSkipWithTracking}
        />
      )}
    </>
  );
};

export default MassConsensusQuestion;
