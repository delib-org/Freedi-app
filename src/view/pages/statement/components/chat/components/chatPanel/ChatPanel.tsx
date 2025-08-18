import { useParams } from "react-router";
import styles from "./ChatPanel.module.scss";
import Chat from "../../Chat";
import ChatIcon from "@/assets/icons/roundedChatDotIcon.svg?react";
import { useEffect, useRef, useState } from "react";
import ChevronLeftIcon from "@/assets/icons/chevronLeftIcon.svg?react";
import { useSelector } from "react-redux";
import { inAppNotificationsSelector } from "@/redux/notificationsSlice/notificationsSlice";
import { NotificationType } from "delib-npm";
import { creatorSelector } from "@/redux/creator/creatorSlice";

const ChatPanel = () => {
  const { screen, statementId } = useParams();
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const chatPanelRef = useRef(null);
  useEffect(() => {
    if (isSideChatOpen && chatPanelRef.current) {
      chatPanelRef.current.scrollTop = 0;
    }
  }, [isSideChatOpen]);

  const creator = useSelector(creatorSelector);

  const inAppNotificationsList: NotificationType[] = useSelector(
    inAppNotificationsSelector
  ).filter((n) => n.creatorId !== creator?.uid && n.parentId === statementId);

  if (
    screen === "mind-map" ||
    screen === "polarization-index" ||
    screen === "agreement-map" ||
    screen === "chat"
  )
    return null;

  const closeChatPanel = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsSideChatOpen(false);
      setIsAnimatingOut(false);
    }, 502);
  };

  const content = (
    <div className={styles.icon}>
      {inAppNotificationsList.length > 0 && (
        <div className={styles.redCircle}>
          {inAppNotificationsList.length < 10
            ? inAppNotificationsList.length
            : `9+`}
        </div>
      )}
      <ChatIcon />
    </div>
  );

  return (
    <div className={styles.chatPanel}>
      {isSideChatOpen ? (
        <div
          className={`${styles.chatPanelContainer} ${isAnimatingOut ? styles.chatPanelClosing : ""}`}
          ref={chatPanelRef}
        >
          <div className={styles.sideChatTitle}>
            <ChatIcon /> <h5>Free Discussion</h5>
          </div>
          <button
            onClick={() => closeChatPanel()}
            className={styles.closeChatPanel}
          >
            <ChevronLeftIcon />
          </button>
          <p>
            Questions and topics that emerged from the main discussion thread
          </p>
          <Chat sideChat={true} />
        </div>
      ) : (
        <div className={styles.chatPanelContainerClosed}>
          <button
            onClick={() => setIsSideChatOpen(true)}
            className={`${styles.openChatPanelBtn} ${styles.toTheRight}`}
          >
            <ChevronLeftIcon />
          </button>
          <button className={styles.openChatPanelBtn}>{content} </button>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
