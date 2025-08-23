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
  const { handleSetSuggestionToDB } = useSimilarSuggestions(
    statementId,
    nextStep
  );

  const [selected, setSelected] = React.useState<number | null>(null);

  function handleSelect(index: number) {
    setSelected(index);
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
    async function skipChoice() {
      await handleSetSuggestionToDB(similarSuggestions[0]);

      navigate(`/mass-consensus/${statementId}/${nextStep}`);
    }
    if (similarSuggestions.length === 1) skipChoice();
  }, [similarSuggestions.length]);

  useEffect(() => {
    setIfButtonEnabled(selected !== null);
  }, [selected]);

  return (
    <>
      <TitleMassConsensus title={t("Thank you for the suggestion!")} />
      <h3>{t("Here are similar suggestions. which one fits best?")}</h3>
      <div className={styles["similar-suggestions"]}>
        {loadingStatements ? (
          <Loader />
        ) : (
          similarSuggestions.map(
            (suggestion: Statement | GeneratedStatement, index: number) => (
              <SimilarCard
                key={`statement: ${index} ${suggestion.statement}`}
                statement={suggestion}
                isUserStatement={index === 0}
                selected={selected !== null && selected === index}
                index={index}
                handleSelect={handleSelect}
              />
            )
          )
        )}
      </div>
    </>
  );
};

export default SimilarSuggestions;
