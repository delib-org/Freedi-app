import { ChangeEvent, FC, useEffect, useRef, useState } from "react";
import StatementChatMore from "../statementChatMore/StatementChatMore";
import UserAvatar from "../userAvatar/UserAvatar";
import SaveTextIcon from "@/assets/icons/SaveTextIcon.svg";
import { updateStatementText } from "@/controllers/db/statements/setStatements";
import { isAuthorized } from "@/controllers/general/helpers";
import { useAppSelector } from "@/controllers/hooks/reduxHooks";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import useStatementColor from "@/controllers/hooks/useStatementColor";
import { statementSubscriptionSelector } from "@/redux/statements/statementsSlice";
import EditTitle from "@/view/components/edit/EditTitle";
import CreateStatementModal from "@/view/pages/statement/components/createStatementModal/CreateStatementModal";
import styles from "./ChatMessageCard.module.scss";
import useAutoFocus from "@/controllers/hooks/useAutoFocus ";
import UploadImage from "@/view/components/uploadImage/UploadImage";
import { StatementType, Statement } from "delib-npm";
import { useAuthentication } from "@/controllers/hooks/useAuthentication";
import ChatMessageMenu from "./ChatMessageMenu";

export interface NewQuestion {
  statement: Statement;
  isOption: boolean;
  showModal: boolean;
}

interface ChatMessageCardProps {
  parentStatement: Statement | undefined;
  statement: Statement;

  previousStatement: Statement | undefined;
  sideChat?: boolean;
}

const ChatMessageCard: FC<ChatMessageCardProps> = ({
  parentStatement,
  statement,
  previousStatement,
  sideChat = false,
}) => {
  const imageUrl = statement.imagesURL?.main ?? "";
  const [image, setImage] = useState<string>(imageUrl);
  // Hooks
  const { statementType } = statement;
  const statementColor = useStatementColor({ statement });
  const { dir } = useUserConfig();
  const { user } = useAuthentication();

  // Redux store
  const statementSubscription = useAppSelector(
    statementSubscriptionSelector(statement.parentId)
  );

  // Use States
  const [isEdit, setIsEdit] = useState(false);
  const [isNewStatementModalOpen, setIsNewStatementModalOpen] = useState(false);
  const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
  const [text, setText] = useState(
    `${statement?.statement}\n${statement.description}`
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Variables
  const _isAuthorized = isAuthorized(
    statement,
    statementSubscription,
    parentStatement?.creator.uid
  );
  const isMe = user?.uid === statement.creator?.uid;
  const isStatement = statementType === StatementType.statement;
  const textareaRef = useAutoFocus(isEdit);

  const isPreviousFromSameAuthor =
    previousStatement?.creator.uid === statement.creator.uid;

  const isAlignedLeft = (isMe && dir === "ltr") || (!isMe && dir === "rtl");

  // Focus the textarea when in edit mode
  useEffect(() => {
    if (isEdit && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEdit]);

  function handleTextChange(
    e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) {
    setText(e.target.value);
  }

  function handleSave() {
    try {
      if (!text) return;
      if (!statement) throw new Error("Statement is undefined");
      const title = text.split("\n")[0];
      const description = text.split("\n").slice(1).join("\n");

      updateStatementText(statement, title, description);
      setIsEdit(false);
    } catch (error) {
      console.error(error);
    }
  }

  const isGeneral =
    statement.statementType === StatementType.statement ||
    statement.statementType === undefined;

  const getMessageBoxClassName = () => {
    const baseClass = styles.messageBox;
    const marginClass = sideChat ? "" : styles.messageMargin;
    if (isStatement) {
      return `${baseClass} ${styles.messageBoxStatement} ${marginClass}`;
    } else {
      return `${baseClass} ${marginClass}`;
    }
  };

  if (!statement) return null;
  if (!parentStatement) return null;

  return (
    <div
      className={`${styles.chatMessageCard}  ${isAlignedLeft ? styles.alignedLeft : ""} ${styles[dir] || ""}`}
    >
      {!isPreviousFromSameAuthor && (
        <div className={styles.user}>
          <UserAvatar user={statement.creator} />
          <span>{statement.creator.displayName}</span>
        </div>
      )}

      <div
        className={getMessageBoxClassName()}
        style={{
          borderColor: isGeneral
            ? "var(--inputBackground)"
            : statementColor.backgroundColor,
        }}
      >
        <div className={styles.triangle} />

        <div className={styles.info}>
          <div className={styles.messageActions}>
            <div className={styles.chatMenu}>
              <ChatMessageMenu
                statement={statement}
                isCardMenuOpen={isCardMenuOpen}
                setIsCardMenuOpen={setIsCardMenuOpen}
                isAuthorized={_isAuthorized}
                setIsEdit={setIsEdit}
                fileInputRef={fileInputRef}
              />
            </div>
          </div>
          <div className={styles.infoText}>
            {isEdit ? (
              <div
                className={styles.inputWrapper}
                style={{
                  flexDirection: isAlignedLeft ? "row" : "row-reverse",
                }}
              >
                <textarea
                  ref={textareaRef} // Ref for managing focus
                  className={styles.editInput}
                  value={text}
                  onChange={handleTextChange}
                  style={{ direction: dir }}
                />
                <button onClick={handleSave}>
                  <img
                    src={SaveTextIcon}
                    className={styles.saveIcon}
                    alt="Save Icon"
                  />
                </button>
              </div>
            ) : (
              <EditTitle
                statement={statement}
                isEdit={isEdit}
                setEdit={setIsEdit}
                isTextArea={true}
              />
            )}
          </div>
          <div className={styles.messageActions}>

            <div className={styles.chatMoreElement}>
              <StatementChatMore statement={statement} />
            </div>
          </div>
        </div>

        <div style={{ display: image ? "flex" : "none" }}>
          <UploadImage
            statement={statement}
            fileInputRef={fileInputRef}
            image={image}
            setImage={setImage}
          />
        </div>

        {isNewStatementModalOpen && (
          <CreateStatementModal
            parentStatement={statement}
            isOption={false}
            setShowModal={setIsNewStatementModalOpen}
          />
        )}
      </div>
    </div>
  );
};

export default ChatMessageCard;
