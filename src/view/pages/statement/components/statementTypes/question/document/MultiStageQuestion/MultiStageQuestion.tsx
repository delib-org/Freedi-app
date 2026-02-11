import { FC, useContext } from "react";
import { useSelector } from "react-redux";
import { StatementContext } from "@/view/pages/statement/StatementCont";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import StagePage from "@/view/pages/statement/components/statementTypes/stage/StagePage";
import { statementSelectorById } from "@/redux/statements/statementsSlice";
import PopperHebbianDiscussion from "../../../../popperHebbian/PopperHebbianDiscussion";

// Hooks
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useStageManagement } from './hooks/useStageManagement';

// Components
import { IntroductionSection } from './sections/IntroductionSection';
import { QuestionsSection } from './sections/QuestionsSection';
import { SolutionsSection } from './sections/SolutionsSection';
import { EmptyStateSection } from './sections/EmptyStateSection';
import { StageModals } from './components/StageModals';
import { DragGhostItem } from './components/DragGhostItem';

// Styles
import styles from "./MultiStageQuestion.module.scss";
import { StatementType } from "@freedi/shared-types";
import { getParagraphsText, hasParagraphsContent } from "@/utils/paragraphUtils";

const MultiStageQuestion: FC = () => {
  const { statement } = useContext(StatementContext);
  const { statementType } = statement || {};
  const isOption = statementType === StatementType.option;
  const { t } = useTranslation();

  // Get parent statement and check if Popper-Hebbian discussion is enabled
  const parentStatement = useSelector(statementSelectorById(statement?.parentId || ""));
  const isPopperHebbianEnabled = parentStatement?.statementSettings?.popperianDiscussionEnabled ?? false;

  // Use custom hooks for state management
  const {
    initialStages,
    topSuggestions,
    showAddStage,
    setShowAddStage,
    handleAddSubQuestion,
    hasStages,
    hasTopSuggestions,
    imageUrl,
  } = useStageManagement({ statement });

  const {
    draggedIndex,
    draggedItem,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useDragAndDrop({ stages: initialStages });

  return (
    <>
      <StageModals
        showAddStage={showAddStage}
        setShowAddStage={setShowAddStage}
      />

      {!hasStages && (
        <EmptyStateSection
          description={hasParagraphsContent(statement?.paragraphs) ? getParagraphsText(statement?.paragraphs) : undefined}
          imageUrl={imageUrl}
        />
      )}

      {/* Show evidence section for options when Popper-Hebbian mode is enabled */}
      {isOption && isPopperHebbianEnabled && statement && (
        <PopperHebbianDiscussion
          statement={statement}
          onCreateImprovedVersion={() => {
            // Could trigger a new refinement session based on collected evidence
          }}
        />
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
        <StagePage showStageTitle={false} showBottomNav={!(isOption && isPopperHebbianEnabled)} />
      ) : (
        <div className={styles.stagesWrapper}>
          <IntroductionSection statement={statement} />

          <QuestionsSection
            stages={initialStages}
            draggedIndex={draggedIndex}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onAddSubQuestion={handleAddSubQuestion}
          />

          {draggedItem && (
            <DragGhostItem
              draggedItem={draggedItem}
              stage={initialStages[draggedItem.index]}
            />
          )}

          {!isOption && <SolutionsSection
            statement={statement}
            topSuggestions={topSuggestions}
            hasTopSuggestions={hasTopSuggestions}
          />}
        </div>
      )}
    </>
  );
};

export default MultiStageQuestion;