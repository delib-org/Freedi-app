import React, { FC, useState } from "react";
import { ExplanationConfig } from "delib-npm";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import {
  explanationTextList,
  useExplanations,
} from "@/contexts/massConsensus/ExplanationProvider";
import { useNavigate } from "react-router";
import styles from "./StageExplanationScreen.module.scss";

interface StageExplanationScreenProps {
  stageId: string;
  explanation?: ExplanationConfig;
  onContinue: () => void;
  onBack?: () => void;
  previousStageUrl?: string;
}

export const StageExplanationScreen: FC<StageExplanationScreenProps> = ({
  stageId,
  explanation: explicitExplanation,
  onContinue,
  onBack,
  previousStageUrl,
}) => {
  const { t, dir } = useTranslation();
  const navigate = useNavigate();
  const {
    getStageExplanation,
    markExplanationSeen,
    setDontShowExplanations,
    getDontShowExplanations,
  } = useExplanations();

  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Get explanation from context or use explicit one
  const explanation = explicitExplanation || getStageExplanation(stageId);

  // If no explanation or disabled, continue directly
  if (!explanation?.enabled || getDontShowExplanations()) {
    onContinue();

    return null;
  }

  const handleContinue = () => {
    // Mark as seen
    markExplanationSeen(stageId);

    // Save don't show preference if checked
    if (dontShowAgain) {
      setDontShowExplanations(true);
    }

    onContinue();
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (previousStageUrl) {
      navigate(previousStageUrl);
    }
  };

  const getIconForStage = () => {
    switch (stageId) {
      case "randomSuggestions":
        return "🎲";
      case "topSuggestions":
        return "⭐";
      case "voting":
        return "🗳️";
      case "question":
        return "💡";
      case "introduction":
        return "👋";
      default:
        return "📋";
    }
  };

  const getExplanationReasons = () => {
    const reason =
      explanationTextList[stageId as keyof typeof explanationTextList];
    if (!reason) return null;

    return (
      <div
        className={styles.infoBox}
        style={{ textAlign: dir === "ltr" ? "left" : "right" }}
      >
        <h3>{t(reason.titleText)}</h3>
        <ul>
          <li>{t(reason.firstReason)}</li>
          <li>{t(reason.secondReason)}</li>
          <li>{t(reason.thirdReason)}</li>
        </ul>
      </div>
    );
  };

  return (
    <div className={styles.explanationScreen} style={{ direction: dir }}>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.iconWrapper}>
            <span className={styles.icon}>{getIconForStage()}</span>
          </div>

          {explanation.title && (
            <h1 className={styles.title}>{t(explanation.title)}</h1>
          )}

          <div className={styles.description}>
            <p>{t(explanation.content)}</p>
          </div>

          {/* Additional info sections if needed */}
          <div className={styles.infoSections}>{getExplanationReasons()}</div>

          {/* Don't show again checkbox */}
          <div className={styles.dontShowWrapper}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              <span>{t("Don't show explanations again")}</span>
            </label>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className={styles.navigation}>
          {(onBack || previousStageUrl) && (
            <button className="btn btn--secondary" onClick={handleBack}>
              {dir == "ltr" ? "←" : "→"} {t("Previous")}
            </button>
          )}

          <button
            className="btn btn--primary btn--large"
            onClick={handleContinue}
          >
            {t("Continue")} {dir == "ltr" ? "→" : "←"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StageExplanationScreen;
