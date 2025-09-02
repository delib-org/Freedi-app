import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useSelector } from "react-redux";
import { selectSimilarStatements } from "@/redux/massConsensus/massConsensusSlice";
import SimilarCard from "./similarCard/SimilarCard";
import { Statement, GeneratedStatement } from "delib-npm";
import styles from "./SimilarSuggestions.module.scss";
import { useSimilarSuggestions } from "./SimilarSuggestionVM";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import Loader from "@/view/components/loaders/Loader";
import {
  getStepNavigation,
  useMassConsensusSteps,
} from "../../MassConsensusVM";
import TitleMassConsensus from "../../TitleMassConsensus/TitleMassConsensus";

const SimilarSuggestions = ({ stage, setIfButtonEnabled }) => {
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const similarSuggestions = useSelector(selectSimilarStatements);
  const { t } = useUserConfig();
  const [loadingStatements, setLoadingStatements] = useState(true);
  const { steps, currentStep } = useMassConsensusSteps();
  const { nextStep } = getStepNavigation(steps, currentStep);
  const { handleSetSuggestionToDB, isLoading } = useSimilarSuggestions(
    statementId,
    nextStep
  );

  const existingSuggestions = similarSuggestions.filter((s) => s.statementId);

  const newSuggestion = similarSuggestions[0];

  const [selected, setSelected] = React.useState<string | null>(null);

  function handleSelect(id: string) {
    setSelected(id);
  }
  useEffect(() => {
    if (similarSuggestions.length === 0) {
      navigate(`/mass-consensus/${statementId}/${nextStep}`);
    } else {
      setLoadingStatements(false);
    }
  }, [similarSuggestions, navigate, statementId]);

  useEffect(() => {
    if (stage === "submitting")
      handleSetSuggestionToDB(similarSuggestions[selected]);
  }, [stage]);

  useEffect(() => {
    if (similarSuggestions.length === 1 && !isLoading) {
      (async () => {
        setSelected(null);

        await handleSetSuggestionToDB(similarSuggestions[0]);
      })();
    }
  }, [similarSuggestions.length, isLoading]);

  useEffect(() => {
    setIfButtonEnabled(selected !== null);
  }, [selected]);

  return (
    <>
      <TitleMassConsensus title={t("Thank you for the suggestion!")} />
      <h3>{t("This is your suggestion")}:</h3>
      <div className={styles["user-suggestion"]}>
        {newSuggestion ? (
          <SimilarCard
            key={`statement: ${newSuggestion.statementId} ${newSuggestion.statement}`}
            statement={newSuggestion}
            isUserStatement={true}
            selected={selected !== null && selected === newSuggestion.statement}
            handleSelect={handleSelect}
          />
        ) : (
          <p>{t("No new suggestion available.")}</p>
        )}
      </div>
      <h3>{t("Here are similar suggestions")}</h3>
      <div className={styles["similar-suggestions"]}>
        {loadingStatements ? (
          <Loader />
        ) : (
          existingSuggestions.map(
            (suggestion: Statement | GeneratedStatement, index: number) => (
              <SimilarCard
                key={`statement: ${index} ${suggestion.statement}`}
                statement={suggestion}
                isUserStatement={false}
                selected={selected !== null && selected === suggestion.statementId}
                handleSelect={handleSelect}
              />
            )
          )
        )}
      </div>
      <h3>{t("Choose the your preferred suggestion")}</h3>
    </>
  );
};

export default SimilarSuggestions;
