import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useSelector } from "react-redux";
import { selectSimilarStatements } from "@/redux/massConsensus/massConsensusSlice";
import SimilarCard from "./similarCard/SimilarCard";
import { Statement } from "delib-npm";
import styles from "./SimilarSuggestions.module.scss";
import { useSimilarSuggestions } from "./SimilarSuggestionVM";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import Loader from "@/view/components/loaders/Loader";
import { useStageNavigation } from "../../MassConsensusVM";
import TitleMassConsensus from "../../TitleMassConsensus/TitleMassConsensus";

interface SimilarSuggestionsProps {
  stage: string;
  setIfButtonEnabled: (enabled: boolean) => void;
  onSuggestionSaved?: () => void;
}

const SimilarSuggestions: React.FC<SimilarSuggestionsProps> = ({ stage, setIfButtonEnabled, onSuggestionSaved }) => {
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const similarSuggestions = useSelector(selectSimilarStatements);
  const { t } = useUserConfig();
  const [loadingStatements, setLoadingStatements] = useState(true);
  const { nextStage } = useStageNavigation();
  const { handleSetSuggestionToDB, isLoading } = useSimilarSuggestions(
    statementId,
    nextStage
  );

  const existingSuggestions = similarSuggestions.filter((s) => s.statementId);

  const newSuggestion = similarSuggestions.length > 0 ? similarSuggestions[0] : null;

  const [selected, setSelected] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSelect(id: string) {
    if (isSubmitting) return;

    setSelected(id);
    setIsSubmitting(true);

    const selectedSuggestion = getSelectedSuggestion(id);
    const success = await handleSetSuggestionToDB(selectedSuggestion);

    if (success) {
      if (onSuggestionSaved) {
        onSuggestionSaved();
      } else {
        navigate(`/mass-consensus/${statementId}/${nextStage}`);
      }
    } else {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (similarSuggestions.length === 0) {
      navigate(`/mass-consensus/${statementId}/${nextStage}`);
    } else {
      setLoadingStatements(false);
    }
  }, [similarSuggestions, navigate, statementId, nextStage]);


  useEffect(() => {
    if (similarSuggestions.length === 1 && !isLoading) {
      // Only one suggestion (user's own) - auto-submit and notify parent
      (async () => {
        setSelected(null);
        const success = await handleSetSuggestionToDB(newSuggestion);
        if (success) {
          // Let parent know the suggestion was saved successfully
          if (onSuggestionSaved) {
            onSuggestionSaved();
          } else {
            // If no callback, navigate directly
            navigate(`/mass-consensus/${statementId}/${nextStage}`);
          }
        }
      })();
    }
  }, [similarSuggestions.length, isLoading]);

  useEffect(() => {
    setIfButtonEnabled(selected !== null);
  }, [selected]);
  
  function getSelectedSuggestion(id: string): Statement | null {
    const selectedSuggestion = similarSuggestions.find((s) => s.statementId === id || s.statement === id);
    if (!selectedSuggestion) return newSuggestion;

    return selectedSuggestion;
  }

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
            (suggestion: Statement, index: number) => (
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
