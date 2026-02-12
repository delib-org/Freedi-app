import { useParams } from "react-router";
import styles from "./ChatPanel.module.scss";
import Chat from "../../Chat";
import ChatIcon from "@/assets/icons/roundedChatDotIcon.svg?react";
import ChatInput from "../input/ChatInput";
import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { inAppNotificationsSelector } from "@/redux/notificationsSlice/notificationsSlice";
import { NotificationType } from "@freedi/shared-types";
import { creatorSelector } from "@/redux/creator/creatorSlice";
import { useSwipe } from "@/controllers/hooks/useSwipe";
import { usePanelState } from "@/controllers/hooks/usePanelState";
import { statementSelector } from "@/redux/statements/statementsSlice";
import UnreadBadge from "@/view/components/unreadBadge/UnreadBadge";

const ChatPanel = () => {
  const { screen, statementId } = useParams();
  const statement = useSelector(statementSelector(statementId));
  const [isSideChatOpen, setIsSideChatOpen] = usePanelState({
    storageKey: 'freedi-chat-panel-open',
    defaultDesktopOpen: true,
    defaultMobileOpen: false
  });
  const chatPanelRef = useRef(null);
  
  const swipeRef = useSwipe({
    onSwipeLeft: () => {
      if (isSideChatOpen) {
        setIsSideChatOpen(false);
      }
    },
    threshold: 80,
    enabled: isSideChatOpen && window.innerWidth <= 768
  });
  
  useEffect(() => {
    if (isSideChatOpen && chatPanelRef.current) {
      chatPanelRef.current.scrollTop = 0;
    }
  }, [isSideChatOpen]);

  const creator = useSelector(creatorSelector);

  // ✅ Filter for UNREAD notifications only for this statement
  const unreadNotificationsList: NotificationType[] = useSelector(
    inAppNotificationsSelector
  ).filter((n) =>
    n.creatorId !== creator?.uid &&
    n.parentId === statementId &&
    (!n.read || n.read === undefined) // ✅ Treat missing field as unread for backward compatibility
  );

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
          {!isSideChatOpen && unreadNotificationsList.length > 0 && (
            <UnreadBadge
              count={unreadNotificationsList.length}
              position="absolute"
              size="small"
              ariaLabel={`${unreadNotificationsList.length} unread message${unreadNotificationsList.length === 1 ? '' : 's'} in chat`}
            />
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
            <div className={styles.chatWrapper}>
              <Chat sideChat={true} showInput={false} />
            </div>
            {statement && (
              <div className={styles.inputWrapper}>
                <ChatInput statement={statement} sideChat={true} />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ChatPanel;
