import { FC, useContext } from "react";
import { StatementContext } from "@/view/pages/statement/StatementCont";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import StagePage from "@/view/pages/statement/components/statementTypes/stage/StagePage";

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
import { StatementType } from "delib-npm";

const MultiStageQuestion: FC = () => {
  const { statement } = useContext(StatementContext);
  const { statementType } = statement || {};
  const isOption = statementType === StatementType.option;
  const { t } = useUserConfig();

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
          description={statement?.description}
          imageUrl={imageUrl}
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
        <StagePage showStageTitle={false} />
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