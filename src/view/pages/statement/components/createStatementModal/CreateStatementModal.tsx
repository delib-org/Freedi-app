import React, { FC, useState, useEffect, useRef } from "react";
import { createStatementFromModal } from "../settings/statementSettingsCont";
import newOptionGraphic from "@/assets/images/newOptionGraphic.png";
import newQuestionGraphic from "@/assets/images/newQuestionGraphic.png";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import Modal from "@/view/components/modal/Modal";
import styles from './CreateStatementModal.module.scss';
import Button, { ButtonType } from "@/view/components/buttons/button/Button";
import { StatementType, Statement } from "delib-npm";
import { validateStatementTypeHierarchy } from "@/controllers/general/helpers";
import { useAuthentication } from "@/controllers/hooks/useAuthentication";

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
  const { t } = useUserConfig();
  const { creator } = useAuthentication();

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, []);

  const onFormSubmit = async () => {
    setShowModal(false);

    await createStatementFromModal({
      creator,
      title,
      description,
      isOptionSelected,
      parentStatement,
      isSendToStoreTemp,
      statementType: isOptionSelected
        ? StatementType.option
        : StatementType.question,
    });

    await getSubStatements?.();
  };

  return (
    <Modal className={styles.createStatementModal}>
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
        />
      </form>
    </Modal>
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
  const { t } = useUserConfig();

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
}

const CreateStatementButtons: FC<CreateStatementButtonsProps> = ({
  isOption,
  onCancel,
}) => {
  const { t } = useUserConfig();

  return (
    <div className={styles.createStatementButtons}>
    
      <Button
        text={t(`Add ${isOption ? "Option" : "Question"}`)}
        buttonType={ButtonType.PRIMARY}
        data-cy="add-statement-simple"
      />
	    <Button
        text={t("Cancel")}
        onClick={onCancel}
        buttonType={ButtonType.SECONDARY}
        className={styles.cancelButton}
      />
    </div>
  );
};
