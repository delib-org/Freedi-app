import React, { FC, useState, useEffect, useRef } from "react";
import { createStatementFromModal } from "../settings/statementSettingsCont";
import newOptionGraphic from "@/assets/images/newOptionGraphic.png";
import newQuestionGraphic from "@/assets/images/newQuestionGraphic.png";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import Modal from "@/view/components/modal/Modal";
import "./CreateStatementModal.scss";
import Button, { ButtonType } from "@/view/components/buttons/button/Button";
import { StatementType, Statement } from "delib-npm";
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
  const [isOptionSelected, setIsOptionSelected] = useState(isOption);
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
    <Modal className="create-statement-modal">
      <form className="overlay" onSubmit={onFormSubmit}>
        <div className="modal-image">
          <img
            src={isOptionSelected ? newOptionGraphic : newQuestionGraphic}
            alt="New Statement"
          />
        </div>

        <Tabs
          isOptionChosen={isOptionSelected}
          setIsOptionChosen={setIsOptionSelected}
          allowedTypes={allowedTypes}
        />

        <div className="form-inputs">
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
}

const Tabs: FC<TabsProps> = ({
  allowedTypes,
  isOptionChosen,
  setIsOptionChosen,
}) => {
  const { t } = useUserConfig();
  const availableTypes = allowedTypes ?? [
    StatementType.option,
    StatementType.question,
  ];

  return (
    <div className="tabs">
      {availableTypes.includes(StatementType.option) && (
        <button
          type="button"
          onClick={() => setIsOptionChosen(true)}
          className={`tab question ${isOptionChosen ? "active" : ""}`}
        >
          {t("Option")}
          {isOptionChosen && <div className="block" />}
        </button>
      )}
      {availableTypes.includes(StatementType.question) && (
        <button
          type="button"
          onClick={() => setIsOptionChosen(false)}
          className={`tab question ${!isOptionChosen ? "active" : ""}`}
        >
          {t("Question")}
          {!isOptionChosen && <div className="block" />}
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
    <div className="create-statement-buttons">
    
      <Button
        text={t(`Add ${isOption ? "Option" : "Question"}`)}
        buttonType={ButtonType.PRIMARY}
        data-cy="add-statement-simple"
      />
	    <Button
        text={t("Cancel")}
        onClick={onCancel}
        buttonType={ButtonType.SECONDARY}
        className="cancel-button"
      />
    </div>
  );
};
