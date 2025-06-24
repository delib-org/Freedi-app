import React from "react";
import { useOnlineUsers } from "@/controllers/hooks/useOnlineUsers";
import styles from "./OnlineUsersStyle.module.scss";

const OnlineUsers = ({ statementId }) => {
  const { onlineUsers, isLoading } = useOnlineUsers(statementId);
  const amountOfShownUsers = 5;
  const shownUsers = onlineUsers.filter((_, idx) => idx < amountOfShownUsers);
  const hiddenCount = onlineUsers.length - shownUsers.length;
  if (isLoading || onlineUsers.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      {shownUsers.map((online) => (
        <div
          key={online.user.uid}
          className={styles.userItem}
          title={online.user.displayName}
        >
          {online.user.photoURL ? (
            <img
              src={online.user.photoURL}
              alt={online.user.displayName}
              className={`${styles.avatar} ${styles.avatarImage} ${
                online.tabInFocus ? styles.activeRing : ""
              }`}
            />
          ) : (
            <div
              className={`${styles.avatar} ${styles.avatarDefault} ${
                online.tabInFocus ? styles.activeRing : ""
              }`}
            >
              <span className={styles.initial}>
                {online.user.displayName?.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className={styles.userItem} title={`${hiddenCount} more`}>
          <div className={styles.moreUsers}>+{hiddenCount}</div>
        </div>
      )}
    </div>
  );
};

export default OnlineUsers;
