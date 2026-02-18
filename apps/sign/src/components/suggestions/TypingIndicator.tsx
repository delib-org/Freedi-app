'use client';

import { useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { getPseudoName } from '@/lib/utils/pseudoName';
import styles from './TypingIndicator.module.scss';

export interface TypingUser {
  id: string;
  displayName: string | null;
  timestamp: number;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  currentUserId: string | null;
  /** When true, hide display names and show generic "Someone" */
  hideUserIdentity?: boolean;
}

/**
 * Displays a real-time typing indicator showing who is currently writing a suggestion.
 * Based on UX specification for subtle, professional collaborative presence.
 */
export default function TypingIndicator({
  typingUsers,
  currentUserId,
  hideUserIdentity = false,
}: TypingIndicatorProps) {
  const { t, tWithParams } = useTranslation();

  console.info('[TypingIndicator] Render with', typingUsers.length, 'typing users, currentUserId:', currentUserId);

  // Filter out current user (should already be done, but double-check)
  const filteredUsers = useMemo(() => {
    return typingUsers.filter((user) => user.id !== currentUserId);
  }, [typingUsers, currentUserId]);

  console.info('[TypingIndicator] After filtering:', filteredUsers.length, 'users to display');

  // Don't render if no one is typing
  if (filteredUsers.length === 0) {
    console.info('[TypingIndicator] No users to display, returning null');

    return null;
  }

  console.info('[TypingIndicator] Rendering indicator for users:', filteredUsers.map(u => u.displayName));

  // Get display names or fallback
  const getDisplayName = (user: TypingUser): string => {
    if (hideUserIdentity) return getPseudoName(user.id);

    return user.displayName || t('Someone');
  };

  // Generate text based on number of typers
  const getText = (): string => {
    const count = filteredUsers.length;

    if (count === 1) {
      const name = getDisplayName(filteredUsers[0]);

      return tWithParams('{{name}} is writing a suggestion...', { name });
    }

    if (count === 2) {
      const name1 = getDisplayName(filteredUsers[0]);
      const name2 = getDisplayName(filteredUsers[1]);

      return tWithParams('{{name1}} and {{name2}} are writing...', { name1, name2 });
    }

    // 3 or more
    const name1 = getDisplayName(filteredUsers[0]);
    const name2 = getDisplayName(filteredUsers[1]);
    const othersCount = count - 2;

    return tWithParams('{{name1}}, {{name2}}, and {{count}} others are writing...', {
      name1,
      name2,
      count: othersCount,
    });
  };

  // Get first letter for avatar
  const getInitial = (user: TypingUser): string => {
    if (hideUserIdentity) return getPseudoName(user.id).charAt(0).toUpperCase();
    if (user.displayName && user.displayName.length > 0) {
      return user.displayName.charAt(0).toUpperCase();
    }

    return '?';
  };

  // Limit avatars to 3
  const displayedUsers = filteredUsers.slice(0, 3);
  const extraCount = filteredUsers.length - 3;

  return (
    <div
      className={styles.typingIndicator}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Avatar Stack */}
      <div className={styles.avatarStack}>
        {displayedUsers.map((user, index) => (
          <div
            key={user.id}
            className={styles.avatar}
            style={{ zIndex: displayedUsers.length - index }}
            title={user.displayName || undefined}
          >
            {getInitial(user)}
          </div>
        ))}
        {extraCount > 0 && (
          <div className={styles.avatarCount}>+{extraCount}</div>
        )}
      </div>

      {/* Text */}
      <span className={styles.text}>{getText()}</span>

      {/* Animated Dots */}
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
