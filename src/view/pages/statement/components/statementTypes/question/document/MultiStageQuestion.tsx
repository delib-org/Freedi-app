import { DragEvent, FC, useContext, useState, useMemo } from "react";
import { StatementContext } from "../../../../StatementCont";
import styles from "./MultiStageQuestion.module.scss";
import Modal from "@/view/components/modal/Modal";
import AddStage from "./addStage/AddStage";
import { useDispatch, useSelector } from "react-redux";
import {
  setStatements,
  statementSubsSelector,
} from "@/redux/statements/statementsSlice";
import {
  setParentStatement,
  setNewStatementType,
  setShowNewStatementModal,
  selectNewStatementShowModal,
} from "@/redux/statements/newStatementSlice";
import StageCard from "./stages/StageCard";
import { updateStatementsOrderToDB } from "@/controllers/db/statements/setStatements";
import { Statement, StatementType } from "delib-npm";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import StagePage from "../../stage/StagePage";
import Text from "@/view/components/text/Text";
import SubGroupCard from "@/view/components/subGroupCard/SubGroupCard";
import NewStatement from "../../../newStatement/NewStatement";
import SuggestionCard from "../../../evaluations/components/suggestionCards/suggestionCard/SuggestionCard";
import { Link } from "react-router";
import newOptionGraphic from "@/assets/images/newOptionGraphic.png";
import InfoIcon from "@/assets/icons/InfoIcon.svg?react";
import Smile from "@/assets/icons/smile.svg?react";

import Research from "@/assets/images/Research.png";
import manWithIdeaLamp from "@/assets/images/manWithIdeaLamp.png";
import BookmarkBar from "@/view/components/bookmarkBar/BookmarkBar";

const MultiStageQuestion: FC = () => {
  const { statement } = useContext(StatementContext);
  const { t } = useUserConfig();
  const dispatch = useDispatch();
  const statementsFromStore = useSelector(
    statementSubsSelector(statement?.statementId)
  );
  const showNewStatementModal = useSelector(selectNewStatementShowModal);
  const topSuggestions = statement.results;
  const imageUrl = statement.imagesURL?.main ?? "";

  const initialStages = useMemo(
    () =>
      statementsFromStore
        .filter(
          (sub: Statement) => sub.statementType === StatementType.question
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [statementsFromStore]
  );

  const [showAddStage, setShowAddStage] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedItem, setDraggedItem] = useState<null | {
    index: number;
    indexOffset: number;
    y: number;
  }>(null);

  const handleDragStart = (
    e: DragEvent<HTMLDivElement>,
    index: number
  ): void => {
    setDraggedIndex(index);
    const topOfTarget = e.currentTarget.getBoundingClientRect().top;
    setDraggedItem({
      index,
      indexOffset: e.clientY - topOfTarget,
      y: topOfTarget,
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (draggedItem) {
      setDraggedItem((prev) =>
        prev ? { ...prev, y: e.clientY - draggedItem.indexOffset } : null
      );
    }
  };

  const handleDrop = (
    e: DragEvent<HTMLDivElement>,
    dropIndex: number
  ): void => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newStages = [...initialStages];
    const draggedStage = newStages[draggedIndex];
    newStages.splice(draggedIndex, 1);
    newStages.splice(dropIndex, 0, draggedStage);

    newStages.forEach((stage, index) => {
      stage.order = index;
    });
    updateStatementsOrderToDB(newStages);

    dispatch(setStatements(newStages));
  };

  const handleDragEnd = (): void => {
    setDraggedItem(null);
    setDraggedIndex(null);
  };

  const handleAddSubQuestion = (): void => {
    if (statement) {
      dispatch(setParentStatement(statement));
      dispatch(setNewStatementType(StatementType.question));
      dispatch(setShowNewStatementModal(true));
    }
  };

  const hasStages = initialStages.length > 0;
  const hasTopSuggestions = topSuggestions.length > 0;

  return (
    <>
      {showAddStage && (
        <Modal>
          <AddStage setShowAddStage={setShowAddStage} />
        </Modal>
      )}
      {showNewStatementModal && (
        <Modal
          closeModal={(e) => {
            if (e.target === e.currentTarget) {
              dispatch(setShowNewStatementModal(false));
            }
          }}
        >
          <NewStatement />
        </Modal>
      )}
      {!hasStages && (
        <div className={`${styles.description} description`}>
          <Text description={statement?.description} fontSize="1.2rem" />
          {imageUrl && (
            <img src={imageUrl} alt="Statement visual representation" />
          )}
        </div>
      )}
      {statement.statementSettings?.enableAddNewSubQuestionsButton && (
        <div className={`btns ${styles["add-stage"]}`}>
          <button
            className="btn btn--secondary"
            onClick={() => setShowAddStage(true)}
          >
            {t("Add sub-question")}
          </button>
        </div>
      )}
      {!hasStages ? (
        <StagePage showStageTitle={false} />
      ) : (
        <div className={styles.stagesWrapper}>
          <BookmarkBar />

          <div className={styles.stageCard} id="introduction">
            <div className={styles.imgContainer}>
              <img
                draggable={false}
                src={newOptionGraphic}
                alt={t("New Option Graphic")}
                className={styles.graphic}
              />
            </div>
            <div className={styles.multiStageTitle}>
              <h3>{statement.statement}</h3>
            </div>
            <div className={styles.topicDescription}>
              <InfoIcon />
              <h4>{t("Topic description")}</h4>
            </div>
            <div className={styles.subDescription}>
              <h5>{statement.description}</h5>
            </div>
          </div>
          <div className={styles.stageCard} id="questions">
            <div className={styles.imgContainer}>
              <img
                draggable={false}
                src={Research}
                alt={t("Research Graphic")}
                className={styles.graphic}
              />
            </div>
            <div className={styles.topicDescription}>
              <div className={styles.magGlass}>⌕</div>
              <h4>{t("Preliminary questions")}</h4>
            </div>
            <div className={styles.subDescription}>
              <h5>{t("Connected questions worth discussing")}</h5>
            </div>
            <div className={styles.subElementsWrapper}>
              {initialStages.map((stage, index) => (
                <div
                  key={stage.statementId}
                  className={`${styles.stageContainer} ${draggedIndex === index ? styles.dragging : ""}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  aria-label={`Draggable stage ${index + 1}`}
                >
                  {/* <div
									className={styles.dragHandle}
									aria-hidden='true'
								></div> */}
                  <SubGroupCard statement={stage} />
                </div>
              ))}
            </div>
            <div className={`btns ${styles["add-stage"]}`}>
              <button
                className="btn btn--secondary"
                onClick={handleAddSubQuestion}
              >
                {t("Add Sub-Question")}
              </button>
            </div>
          </div>

          {draggedItem && (
            <div
              className={styles.ghostItem}
              style={{
                top: `${draggedItem.y}px`,
                position: "absolute",
                transform: "translateX(-20%)",
                opacity: 0.5,
                pointerEvents: "none",
              }}
            >
              <StageCard statement={initialStages[draggedItem.index]} />
            </div>
          )}
          <div className={styles.stageCard} id="solution">
            <div className={styles.imgContainer}>
              <img
                className={styles.graphic}
                src={manWithIdeaLamp}
                alt="man With Idea Lamp Graphic"
              />
            </div>
            <div className={styles.topicDescription}>
              <Smile />
              <h4>{t("Top solutions")}</h4>
            </div>
            <div className={styles.subDescription}>
              <h5>{t("Solutions for discussed issue")}</h5>
            </div>
            <div className={styles.suggestionsWrapper}>
              {hasTopSuggestions &&
                topSuggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.statementId}
                    statement={suggestion}
                    siblingStatements={statement.results}
                    parentStatement={statement}
                    positionAbsolute={false}
                  />
                ))}
              <div className={`btns ${styles["add-stage"]}`}>
                <Link
                  to={`/stage/${statement.statementId}`}
                  state={{ from: window.location.pathname }}
                >
                  <button className="btn btn--primary">
                    {t(
                      hasTopSuggestions
                        ? "See all suggestions"
                        : "Add new suggestion"
                    )}
                  </button>
                </Link>
                <Link to={`/my-suggestions/statement/${statement.statementId}`}>
                  <button className="btn btn--secondary">
                    {t("View My Suggestions")}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MultiStageQuestion;
