/**
 * SocialFeed Component
 * Shows recent activity from other users
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';

export interface SocialActivity {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: 'voted' | 'suggested' | 'proposed';
  timestamp: number;
}

export interface SocialFeedProps {
  activities: SocialActivity[];
  maxItems?: number;
  className?: string;
}

const SocialFeed: React.FC<SocialFeedProps> = ({
  activities,
  maxItems = 20,
  className,
}) => {
  const { t, tWithParams } = useTranslation();

  // Limit activities to maxItems
  const displayedActivities = activities.slice(0, maxItems);

  // Format relative time
  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) {
      return t('just now');
    } else if (minutes < 60) {
      return tWithParams('{{count}} minutes ago', { count: minutes });
    } else if (hours < 24) {
      return tWithParams('{{count}} hours ago', { count: hours });
    } else {
      return tWithParams('{{count}} days ago', { count: Math.floor(hours / 24) });
    }
  };

  // Get action text
  const getActionText = (action: SocialActivity['action']): string => {
    switch (action) {
      case 'voted':
        return t('voted');
      case 'suggested':
        return t('suggested improvement');
      case 'proposed':
        return t('proposed new idea');
      default:
        return '';
    }
  };

  // Get user initials for avatar placeholder
  const getUserInitials = (userName: string): string => {
    return userName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (displayedActivities.length === 0) {
    return (
      <div className={clsx('social-feed', className)}>
        <div className="social-feed__empty">
          {t('No recent activity')}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('social-feed', className)}>
      <h3 className="social-feed__title">{t('Recent Activity')}</h3>

      <div className="social-feed__list">
        {displayedActivities.map((activity) => (
          <div key={activity.id} className="social-feed__item">
            {activity.userAvatar ? (
              <img
                src={activity.userAvatar}
                alt=""
                className="social-feed__avatar"
              />
            ) : (
              <div className="social-feed__avatar-placeholder">
                {getUserInitials(activity.userName)}
              </div>
            )}

            <div className="social-feed__content">
              <div className="social-feed__user">{activity.userName}</div>
              <div className="social-feed__action">
                {getActionText(activity.action)}
              </div>
            </div>

            <div className="social-feed__time">
              {formatTime(activity.timestamp)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SocialFeed;
