'use client';

import { useState, useEffect } from 'react';
import styles from './SocialFeed.module.css';

interface ActivityItem {
  id: string;
  user: string;
  action: 'voted' | 'suggested' | 'proposed';
  text: string;
  timestamp: Date;
}

// Generate random Hebrew names for demo
const hebrewNames = [
  'דני', 'מיכל', 'יוסי', 'שרה', 'אבי', 'רונית', 'משה', 'תמר',
  'עמית', 'נועה', 'גיל', 'יעל', 'רון', 'ליאת', 'אורי', 'דנה'
];

const actionTexts = {
  voted: ['הצביע/ה', 'השתתף/ה בהצבעה', 'שיתף/ה דעה'],
  suggested: ['הציע/ה שיפור', 'הגיש/ה הצעה'],
  proposed: ['הציע/ה רעיון חדש', 'הוסיף/ה הצעה']
};

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomActivity(): ActivityItem {
  const actions: ('voted' | 'suggested' | 'proposed')[] = ['voted', 'voted', 'voted', 'suggested', 'proposed'];
  const action = getRandomItem(actions);

  return {
    id: Math.random().toString(36).substring(7),
    user: getRandomItem(hebrewNames),
    action,
    text: getRandomItem(actionTexts[action]),
    timestamp: new Date()
  };
}

interface SocialFeedProps {
  isActive?: boolean;
  maxItems?: number;
  intervalMs?: number;
}

export default function SocialFeed({
  isActive = true,
  maxItems = 5,
  intervalMs = 3000
}: SocialFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    // Add initial activity
    setActivities([generateRandomActivity()]);

    // Periodically add new activities
    const interval = setInterval(() => {
      setActivities(prev => {
        const newActivity = generateRandomActivity();
        const updated = [newActivity, ...prev];
        return updated.slice(0, maxItems);
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isActive, maxItems, intervalMs]);

  const getActionIcon = (action: ActivityItem['action']) => {
    switch (action) {
      case 'voted': return '🗳️';
      case 'suggested': return '💡';
      case 'proposed': return '✨';
      default: return '📌';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 5) return 'עכשיו';
    if (diffSec < 60) return `לפני ${diffSec} שניות`;
    return `לפני ${Math.floor(diffSec / 60)} דקות`;
  };

  if (!isActive || activities.length === 0) return null;

  return (
    <div className={`${styles.container} ${isExpanded ? styles.expanded : ''}`}>
      <button
        className={styles.toggle}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse feed' : 'Expand feed'}
      >
        <span className={styles.toggleIcon}>
          {isExpanded ? '▼' : '▲'}
        </span>
        <span className={styles.toggleText}>
          פעילות קהילתית ({activities.length})
        </span>
        <span className={styles.liveBadge}>
          <span className={styles.liveDot}></span>
          Live
        </span>
      </button>

      <div className={styles.feed}>
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className={`${styles.item} ${index === 0 ? styles.newest : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className={styles.icon}>{getActionIcon(activity.action)}</span>
            <span className={styles.user}>{activity.user}</span>
            <span className={styles.action}>{activity.text}</span>
            <span className={styles.time}>{formatTime(activity.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
