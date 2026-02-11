import { FC, useEffect, useRef, useState } from "react";
import StatementChatMore from "../statementChatMore/StatementChatMore";
import UserAvatar from "../userAvatar/UserAvatar";
import { isAuthorized } from "@/controllers/general/helpers";
import { useAppSelector } from "@/controllers/hooks/reduxHooks";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import useStatementColor from "@/controllers/hooks/useStatementColor";
import { statementSubscriptionSelector } from "@/redux/statements/statementsSlice";
import EditableStatement from "@/view/components/edit/EditableStatement";
import CreateStatementModal from "@/view/pages/statement/components/createStatementModal/CreateStatementModal";
import styles from "./ChatMessageCard.module.scss";
import UploadImage from "@/view/components/uploadImage/UploadImage";
import { StatementType, Statement } from "@freedi/shared-types";
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

  // Real-time listener for image changes
  useEffect(() => {
    if (statement?.imagesURL?.main !== undefined) {
      setImage(statement.imagesURL.main);
    }
  }, [statement?.imagesURL?.main]);

  // Hooks
  const { statementType } = statement;
  const statementColor = useStatementColor({ statement });
  const { dir } = useTranslation();
  const { user } = useAuthentication();

  // Redux store
  const statementSubscription = useAppSelector(
    statementSubscriptionSelector(statement.parentId)
  );

  // Use States
  const [isEdit, setIsEdit] = useState(false);
  const [isNewStatementModalOpen, setIsNewStatementModalOpen] = useState(false);
  const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Variables
  const _isAuthorized = isAuthorized(
    statement,
    statementSubscription,
    parentStatement?.creator?.uid
  );
  const isMe = user?.uid === statement.creator?.uid;
  const isStatement = statementType === StatementType.statement;

  const isPreviousFromSameAuthor =
    previousStatement?.creator?.uid === statement?.creator?.uid;

  const isAlignedLeft = (isMe && dir === "ltr") || (!isMe && dir === "rtl");

  // Handle save callback
  function handleSaveSuccess() {
    setIsEdit(false);
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
                parentStatement={parentStatement}
                isCardMenuOpen={isCardMenuOpen}
                setIsCardMenuOpen={setIsCardMenuOpen}
                isAuthorized={_isAuthorized}
                setIsEdit={setIsEdit}
                fileInputRef={fileInputRef}
              />
            </div>
          </div>
          <div className={styles.infoText}>
            <EditableStatement
              statement={statement}
              multiline={true}
              forceEditing={isEdit}
              onSaveSuccess={handleSaveSuccess}
              onEditEnd={() => setIsEdit(false)}
              className={styles.editableMessage}
              inputClassName={styles.editInput}
              containerClassName={styles.editContainer}
              saveButtonClassName={styles.editButtons}
            />
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
