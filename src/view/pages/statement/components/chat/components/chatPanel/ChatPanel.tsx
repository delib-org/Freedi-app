import { useParams } from "react-router";
import styles from "./ChatPanel.module.scss";
import Chat from "../../Chat";
import ChatIcon from "@/assets/icons/roundedChatDotIcon.svg?react";
import { useState } from "react";
import ChevronLeftIcon from "@/assets/icons/chevronLeftIcon.svg?react";

const ChatPanel = () => {
  const { screen } = useParams();
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  if (
    screen === "mind-map" ||
    screen === "polarization-index" ||
    screen === "agreement-map" ||
    screen === "chat"
  )
    return null;

  return (
    <>
      {isSideChatOpen ? (
        <div className={styles.chatPanelContainer}>
          <div className={styles.sideChatTitle}>
            <ChatIcon /> <h5>Free Discussion</h5>
          </div>
		  <button onClick={()=>setIsSideChatOpen(false)} className={styles.closeChatPanel}>  <ChevronLeftIcon /></button>
          <p>
            Questions and topics that emerged from the main discussion thread
          </p>
          <Chat sideChat={true} />
        </div>
      ) : (
        <div className={styles.chatPanelContainerClosed}>
          <button
            onClick={() => setIsSideChatOpen(true)}
            className={styles.openChatPanelBtn}
          >
            <ChevronLeftIcon />
          </button>
          <button className={styles.openChatPanelBtn}>
            <ChatIcon />
          </button>
        </div>
      )}
    </>
  );
};

export default ChatPanel;
