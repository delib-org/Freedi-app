import { FC, RefObject } from "react";
import DeleteIcon from "@/assets/icons/delete.svg?react";
import EditIcon from "@/assets/icons/editIcon.svg?react";
import LightBulbIcon from "@/assets/icons/lightBulbIcon.svg?react";
import QuestionMarkIcon from "@/assets/icons/questionIcon.svg?react";
import UploadImageIcon from "@/assets/icons/updateIcon.svg?react";
import {
  setStatementIsOption,
  updateIsQuestion,
} from "@/controllers/db/statements/setStatements";
import { deleteStatementFromDB } from "@/controllers/db/statements/deleteStatements";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import Menu from "@/view/components/menu/Menu";
import MenuOption from "@/view/components/menu/MenuOption";
import { Statement, StatementType } from "delib-npm";

interface ChatMessageMenuProps {
  statement: Statement;
  isCardMenuOpen: boolean;
  setIsCardMenuOpen: (isOpen: boolean) => void;
  isAuthorized: boolean;
  setIsEdit: (isEdit: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement>;
}

const ChatMessageMenu: FC<ChatMessageMenuProps> = ({
  statement,
  isCardMenuOpen,
  setIsCardMenuOpen,
  isAuthorized,
  setIsEdit,
  fileInputRef,
}) => {
  const { t } = useUserConfig();
  const isQuestion = statement.statementType === StatementType.question;
  const isOption = statement.statementType === StatementType.option;

  function handleSetOption() {
    try {
      if (statement.statementType === StatementType.option) {
        const cancelOption = window.confirm(
          "Are you sure you want to cancel this option?"
        );
        if (cancelOption) {
          setStatementIsOption(statement);
        }
      } else {
        setStatementIsOption(statement);
      }
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <Menu
      setIsOpen={setIsCardMenuOpen}
      isMenuOpen={isCardMenuOpen}
      iconColor="var(--icon-blue)"
      isCardMenu={true}
    >
      {isAuthorized && (
        <MenuOption
          label={t("Edit Text")}
          icon={<EditIcon />}
          onOptionClick={() => {
            setIsEdit(true);
            setIsCardMenuOpen(false);
          }}
        />
      )}
      {isAuthorized && (
        <MenuOption
          label={t("Upload Image")}
          icon={<UploadImageIcon />}
          onOptionClick={() => fileInputRef.current?.click()}
        />
      )}
      {isAuthorized && (
        <MenuOption
          isOptionSelected={isOption}
          icon={<LightBulbIcon />}
          label={
            isOption ? t("Unmark as a Solution") : t("Mark as a Solution")
          }
          onOptionClick={() => {
            handleSetOption();
            setIsCardMenuOpen(false);
          }}
        />
      )}

      {!isOption && (
        <MenuOption
          isOptionSelected={isQuestion}
          label={
            isQuestion
              ? t("Unmark as a Question")
              : t("Mark as a Question")
          }
          icon={<QuestionMarkIcon />}
          onOptionClick={() => {
            updateIsQuestion(statement);
            setIsCardMenuOpen(false);
          }}
        />
      )}
      {isAuthorized && (
        <MenuOption
          label={t("Delete")}
          icon={<DeleteIcon />}
          onOptionClick={() => {
            deleteStatementFromDB(statement, !!isAuthorized);
            setIsCardMenuOpen(false);
          }}
        />
      )}
    </Menu>
  );
};

export default ChatMessageMenu;