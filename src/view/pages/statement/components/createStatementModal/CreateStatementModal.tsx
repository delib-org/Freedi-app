import React, { FC, useState, useEffect, useRef } from "react";
import { createStatementFromModal } from "../settings/statementSettingsCont";
import newOptionGraphic from "@/assets/images/newOptionGraphic.png";
import newQuestionGraphic from "@/assets/images/newQuestionGraphic.png";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import styles from './CreateStatementModal.module.scss';
import Button, { ButtonType } from "@/view/components/buttons/button/Button";
import { StatementType, Statement, ParagraphType } from "@freedi/shared-types";
import { validateStatementTypeHierarchy } from "@/controllers/general/helpers";
import { useAuthentication } from "@/controllers/hooks/useAuthentication";
import { MultiSuggestionPreviewModal, SplitSuggestion } from "@/view/components/multiSuggestion";
import { detectMultipleSuggestionsWithTimeout, DetectedSuggestion } from "@/services/multiSuggestionDetection";
import { logError } from "@/utils/errorHandling";
import { generateParagraphId } from "@/utils/paragraphUtils";

interface CreateStatementModalProps {
  parentStatement: Statement | "top";
  isOption: boolean;
  setShowModal: (bool: boolean) => void;
  getSubStatements?: () => Promise<void>;
  isSendToStoreTemp?: boolean;
  allowedTypes?: StatementType[];
}

const CreateStatementModal: FC<CreateStatementModalProps> = ({
  parentStatement,
  isOption,
  setShowModal,
  getSubStatements,
  isSendToStoreTemp,
  allowedTypes,
}) => {
  // Default to question if parent is an option (since options can't be created under options)
  const defaultIsOption = parentStatement !== 'top' && parentStatement.statementType === StatementType.option
    ? false
    : isOption;
  const [isOptionSelected, setIsOptionSelected] = useState(defaultIsOption);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showMultiPreview, setShowMultiPreview] = useState(false);
  const [multiSuggestions, setMultiSuggestions] = useState<SplitSuggestion[]>([]);
  const [isCheckingMulti, setIsCheckingMulti] = useState(false);
  const { t } = useTranslation();
  const { creator } = useAuthentication();

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Check if multi-suggestion detection is enabled for this statement
  // Note: enableMultiSuggestionDetection setting needs to be added to delib-npm StatementSettings
  // For now, disable in main app - feature is fully implemented in MC app only
  const isMultiSuggestionEnabled = false;
  // TODO: Re-enable when delib-npm is updated with enableMultiSuggestionDetection setting
  // const isMultiSuggestionEnabled = parentStatement !== 'top'
  //   && parentStatement.statementSettings?.enableMultiSuggestionDetection === true;

  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, []);

  // Helper to convert description text to paragraphs array
  const textToParagraphs = (text: string) => {
    if (!text.trim()) return undefined;
    const lines = text.split('\n').filter(line => line.trim());
    
return lines.map((line, index) => ({
      paragraphId: generateParagraphId(),
      type: ParagraphType.paragraph,
      content: line,
      order: index,
    }));
  };

  // Submit a single statement
  const submitSingleStatement = async () => {
    setShowModal(false);

    await createStatementFromModal({
      creator,
      title,
      paragraphs: textToParagraphs(description),
      isOptionSelected,
      parentStatement,
      isSendToStoreTemp,
      statementType: isOptionSelected
        ? StatementType.option
        : StatementType.question,
    });

    await getSubStatements?.();
  };

  // Handle form submission
  const onFormSubmit = async () => {
    // Only check for multi-suggestions when:
    // 1. The setting is enabled
    // 2. We're creating an option (not a question)
    // 3. User has entered text
    if (isMultiSuggestionEnabled && isOptionSelected && title.trim().length > 0) {
      setIsCheckingMulti(true);

      try {
        const userInput = title + (description ? `: ${description}` : '');
        const parentId = parentStatement !== 'top' ? parentStatement.statementId : '';

        const result = await detectMultipleSuggestionsWithTimeout(
          userInput,
          parentId,
          creator?.uid || ''
        );

        if (result.ok && result.isMultipleSuggestions && result.suggestions.length > 1) {
          // Convert to SplitSuggestion format
          const splitSuggestions: SplitSuggestion[] = result.suggestions.map((s: DetectedSuggestion, i: number) => ({
            id: `suggestion-${i}-${Date.now()}`,
            title: s.title,
            description: s.description,
            originalText: s.originalText,
            isRemoved: false,
          }));

          setMultiSuggestions(splitSuggestions);
          setShowMultiPreview(true);
          setIsCheckingMulti(false);
          
return;
        }
      } catch (error) {
        logError(error, {
          operation: 'CreateStatementModal.checkMultiSuggestion',
          userId: creator?.uid,
        });
      }

      setIsCheckingMulti(false);
    }

    // Continue with normal submission
    await submitSingleStatement();
  };

  // Handle confirming multiple suggestions
  const handleConfirmMultiSuggestions = async (suggestions: SplitSuggestion[]) => {
    setShowModal(false);

    for (const suggestion of suggestions) {
      await createStatementFromModal({
        creator,
        title: suggestion.title,
        paragraphs: textToParagraphs(suggestion.description),
        isOptionSelected: true,
        parentStatement,
        isSendToStoreTemp,
        statementType: StatementType.option,
      });
    }

    await getSubStatements?.();
  };

  // Handle dismissing multi-suggestion preview (submit original as-is)
  const handleDismissMulti = () => {
    setShowMultiPreview(false);
    submitSingleStatement();
  };

  // Handle canceling the multi-preview (go back to form)
  const handleCancelMulti = () => {
    setShowMultiPreview(false);
  };

  // Render multi-suggestion preview modal if needed
  if (showMultiPreview) {
    return (
      <MultiSuggestionPreviewModal
        originalText={title + (description ? `: ${description}` : '')}
        suggestions={multiSuggestions}
        onConfirm={handleConfirmMultiSuggestions}
        onDismiss={handleDismissMulti}
        onCancel={handleCancelMulti}
        isSubmitting={false}
      />
    );
  }

  return (
    <div className={styles.createStatementModal}>
      <form className={styles.overlay} onSubmit={onFormSubmit}>
        <div className={styles.modalImage}>
          <img
            src={isOptionSelected ? newOptionGraphic : newQuestionGraphic}
            alt="New Statement"
          />
        </div>

        <Tabs
          isOptionChosen={isOptionSelected}
          setIsOptionChosen={setIsOptionSelected}
          allowedTypes={allowedTypes}
          parentStatement={parentStatement}
        />

        <div className={styles.formInputs}>
          <input
            data-cy="statement-title-simple"
            autoComplete="off"
            ref={titleInputRef}
            type="text"
            placeholder={t("Title")}
            required
            minLength={3}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
          />
          <textarea
            name="description"
            placeholder={t("Description")}
            rows={4}
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
          ></textarea>
        </div>

        <CreateStatementButtons
          isOption={isOptionSelected}
          onCancel={() => setShowModal(false)}
          isLoading={isCheckingMulti}
        />
      </form>
    </div>
  );
};

export default CreateStatementModal;

interface TabsProps {
  allowedTypes?: StatementType[];
  isOptionChosen: boolean;
  setIsOptionChosen: (isOptionChosen: boolean) => void;
  parentStatement: Statement | "top";
}

const Tabs: FC<TabsProps> = ({
  allowedTypes,
  isOptionChosen,
  setIsOptionChosen,
  parentStatement,
}) => {
  const { t } = useTranslation();

  // Determine available types based on parent restrictions
  let availableTypes = allowedTypes;
  if (!availableTypes) {
    const defaultTypes = [StatementType.option, StatementType.question];

    // Filter out types that aren't allowed under this parent
    if (parentStatement && parentStatement !== 'top') {
      availableTypes = defaultTypes.filter(type => {
        const validation = validateStatementTypeHierarchy(parentStatement, type);
        
return validation.allowed;
      });
    } else {
      availableTypes = defaultTypes;
    }
  }

  // Check if option is disabled due to parent being an option
  const isOptionDisabled = parentStatement !== 'top' &&
    parentStatement.statementType === StatementType.option &&
    !availableTypes.includes(StatementType.option);

  return (
    <div className={styles.tabs}>
      {(availableTypes.includes(StatementType.option) || isOptionDisabled) && (
        <button
          type="button"
          onClick={() => !isOptionDisabled && setIsOptionChosen(true)}
          className={`${styles.tab} question ${isOptionChosen ? styles.active : ""} ${isOptionDisabled ? styles.disabled : ""}`}
          title={isOptionDisabled ? t("Options cannot be created under other options") : ""}
          disabled={isOptionDisabled}
        >
          {t("Option")}
          {isOptionChosen && <div className={styles.block} />}
        </button>
      )}
      {availableTypes.includes(StatementType.question) && (
        <button
          type="button"
          onClick={() => setIsOptionChosen(false)}
          className={`${styles.tab} question ${!isOptionChosen ? styles.active : ""}`}
        >
          {t("Question")}
          {!isOptionChosen && <div className={styles.block} />}
        </button>
      )}
    </div>
  );
};

interface CreateStatementButtonsProps {
  isOption: boolean;
  onCancel: VoidFunction;
  isLoading?: boolean;
}

const CreateStatementButtons: FC<CreateStatementButtonsProps> = ({
  isOption,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.createStatementButtons}>
      <Button
        text={isLoading ? t("Checking...") : t(`Add ${isOption ? "Option" : "Question"}`)}
        buttonType={ButtonType.PRIMARY}
        data-cy="add-statement-simple"
        disabled={isLoading}
      />
      <Button
        text={t("Cancel")}
        onClick={onCancel}
        buttonType={ButtonType.SECONDARY}
        className={styles.cancelButton}
        disabled={isLoading}
      />
    </div>
  );
};
