import { useParams } from "react-router";
import styles from "./ChatPanel.module.scss";
import Chat from "../../Chat";
import ChatIcon from "@/assets/icons/roundedChatDotIcon.svg?react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { inAppNotificationsSelector } from "@/redux/notificationsSlice/notificationsSlice";
import { NotificationType } from "delib-npm";
import { creatorSelector } from "@/redux/creator/creatorSlice";
import { useSwipe } from "@/controllers/hooks/useSwipe";

const ChatPanel = () => {
  const { screen, statementId } = useParams();
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  const chatPanelRef = useRef(null);
  
  const swipeRef = useSwipe({
    onSwipeLeft: () => {
      if (isSideChatOpen) {
        setIsSideChatOpen(false);
      }
    },
    enabled: isSideChatOpen && window.innerWidth <= 768
  });
  
  useEffect(() => {
    if (isSideChatOpen && chatPanelRef.current) {
      chatPanelRef.current.scrollTop = 0;
    }
  }, [isSideChatOpen]);

  const creator = useSelector(creatorSelector);

  const inAppNotificationsList: NotificationType[] = useSelector(
    inAppNotificationsSelector
  ).filter((n) => n.creatorId !== creator?.uid && n.parentId === statementId);

  // Don't show ChatPanel on these specific screens
  if (
    screen === "mind-map" ||
    screen === "polarization-index" ||
    screen === "agreement-map" ||
    screen === "chat"
  )
    return null;

  const toggleChatPanel = () => {
    setIsSideChatOpen(!isSideChatOpen);
  };

  return (
    <div className={styles.chatPanel}>
      <div
        className={isSideChatOpen ? styles.chatPanelContainer : styles.chatPanelContainerClosed}
        ref={(el) => {
          chatPanelRef.current = el;
          swipeRef.current = el;
        }}
      >
        <button
          onClick={toggleChatPanel}
          className={styles.toggleButton}
        >
          {!isSideChatOpen && inAppNotificationsList.length > 0 && (
            <div className={styles.notificationBadge}>
              {inAppNotificationsList.length < 10
                ? inAppNotificationsList.length
                : `9+`}
            </div>
          )}
          <div className={styles.toggleIcon}>
            <ChatIcon />
          </div>
        </button>
        {isSideChatOpen ? (
          <div className={styles.content}>
            <div className={styles.sideChatTitle}>
              <ChatIcon /> <h5>Free Discussion</h5>
            </div>
            <Chat sideChat={true} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ChatPanel;
