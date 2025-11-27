import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router";
import TitleMassConsensus from "../../TitleMassConsensus/TitleMassConsensus";
import { useDispatch, useSelector } from "react-redux";
import {
  setStatement,
  statementSelector,
} from "@/redux/statements/statementsSlice";
import { useInitialQuestion } from "./InitialQuestionVM";
import { Role } from "delib-npm";
import styles from "./InitialQuestion.module.scss";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import Textarea from "@/view/components/textarea/Textarea";
import { updateStatementText } from "@/controllers/db/statements/setStatements";
import { prefetchRandomBatches, prefetchTopStatements } from "@/redux/massConsensus/massConsensusSlice";
import type { AppDispatch } from "@/redux/types";

type QuestionStage = "question" | "loading" | "submitting" | "suggestions";

interface InitialQuestionProps {
  stage: QuestionStage;
  setStage: React.Dispatch<React.SetStateAction<QuestionStage>>;
  setIfButtonEnabled: (enabled: boolean) => void;
  setReachedLimit: (reached: boolean) => void;
  onNext?: () => void;
  onSkip?: () => void;
  onBack?: () => void;
  isNextActive?: boolean;
}

const InitialQuestion = ({
  stage,
  setStage,
  setIfButtonEnabled,
  setReachedLimit,
  onNext,
  onSkip,
  onBack,
  isNextActive = false,
}: InitialQuestionProps) => {
  const { statementId } = useParams<{ statementId: string }>();
  const statement = useSelector(statementSelector(statementId));
  const [description, setDescription] = useState("");
  const dispatch = useDispatch<AppDispatch>(); // Dispatch to update the redux state
  const { handleSetInitialSuggestion, ready, error, subscription } =
    useInitialQuestion(description);
  const { t } = useTranslation();
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(statement ? statement.statement : "");
  const hasPrefetched = useRef(false);

  const isAdmin = subscription?.role === Role.admin;

  useEffect(() => {
    if (stage === "loading") handleSetInitialSuggestion();
  }, [stage]);

  useEffect(() => {
    if (error?.blocking) setReachedLimit(true);
  }, [error]);

  useEffect(() => {
    if (ready && !error) setStage("suggestions");
  }, [ready, error]);

  useEffect(() => {
    if (error?.message&&!error?.blocking) setStage("question");
  }, [error]);

  useEffect(() => {
    setIfButtonEnabled(description !== "");

    // Start prefetching when user types enough text (more than 10 characters)
    // Only prefetch once per session
    if (description.length > 10 && !hasPrefetched.current && statementId) {
      hasPrefetched.current = true;

      // Prefetch random batches for smoother experience
      dispatch(prefetchRandomBatches({
        statementId,
        batchCount: 3
      }));

      // Also prefetch top statements
      dispatch(prefetchTopStatements(statementId));
    }
  }, [description, statementId, dispatch]);

  async function handleSubmitInitialQuestionText(e: { preventDefault: () => void }): Promise<void> {
    e.preventDefault();

    if (title.trim().length < 5) {
      alert(
        "Title must be at least 5 characters long and cannot be just spaces"
      );

      return;
    }
    if (error?.blocking) return;
    await updateStatementText(statement, title);

    dispatch(setStatement({ ...statement, statement: title }));

    setEdit(false);
  }

  const fixedInputContent = (
    <div className={styles.fixedInput}>
      <h3 className={styles.fixedInput__title}>{t("Please suggest a solution")}</h3>
      {error?.message && <h4 className={styles.error}>{t(error?.message)}</h4>}
      <Textarea
        isDisabled={stage === "submitting" || error?.blocking}
        name="your-description"
        label={t("Your suggestion")}
        placeholder=""
        backgroundColor="var(--card-default)"
        maxLength={120}
        onChange={setDescription}
        value={description}
        minRows={1}
        maxRows={8}
        onKeyUp={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSetInitialSuggestion();
          }
        }}
      />
      <div className={styles.fixedInput__buttons}>
        {onBack && (
          <button
            className="btn btn--massConsensus btn--secondary"
            onClick={onBack}
          >
            {t("Back")}
          </button>
        )}
        {onSkip && (
          <button
            className="btn btn--massConsensus btn--secondary"
            onClick={onSkip}
          >
            {t("Skip")}
          </button>
        )}
        {onNext && (
          <button
            className={`btn btn--massConsensus btn--primary ${!isNextActive ? "btn--disabled" : ""}`}
            onClick={onNext}
            disabled={!isNextActive}
          >
            {t("Next")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.initialQuestion}>
      <div className={styles.content}>
        {!edit ? (
          <TitleMassConsensus
            title={`${t("Question")}: ${statement ? statement.statement : ""}`}
          ></TitleMassConsensus>
        ) : (
          <form onSubmit={handleSubmitInitialQuestionText}>
            <textarea
              className={styles.textarea}
              placeholder={statement ? statement.statement : ""}
              onChange={(e) => setTitle(e.target.value)}
              onKeyUp={(e) => {
                if (e.key === "Enter") {
                  handleSubmitInitialQuestionText(e);
                }
              }}
            />
            <div className="btns">
              <button className="btn btn--primary" type="submit">
                {t("submit")}
              </button>
            </div>
          </form>
        )}
        {isAdmin && !edit && (
          <div className="btns">
            <button
              className="btn btn--secondary"
              onClick={() => setEdit(true)}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setEdit(true);
                }
              }}
              tabIndex={0}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {createPortal(fixedInputContent, document.body)}
    </div>
  );
};

export default InitialQuestion;
