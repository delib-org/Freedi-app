'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './SocialFeed.module.css';

interface ActivityItem {
  id: string;
  user: string;
  action: 'voted' | 'suggested' | 'proposed';
  textKey: string;
  timestamp: Date;
}

// Generate random names per language
const namesByLang: Record<string, string[]> = {
  he: ['דני', 'מיכל', 'יוסי', 'שרה', 'אבי', 'רונית', 'משה', 'תמר', 'עמית', 'נועה', 'גיל', 'יעל', 'רון', 'ליאת', 'אורי', 'דנה'],
  en: ['Dan', 'Sarah', 'Mike', 'Emma', 'Alex', 'Noa', 'James', 'Lily', 'Ben', 'Ella', 'Tom', 'Mia', 'Ron', 'Lea', 'Uri', 'Dana'],
  ar: ['أحمد', 'فاطمة', 'محمد', 'سارة', 'علي', 'نور', 'خالد', 'ليلى', 'عمر', 'هند', 'يوسف', 'مريم', 'حسن', 'دانا', 'رامي', 'سلمى'],
  de: ['Max', 'Anna', 'Felix', 'Laura', 'Leon', 'Marie', 'Noah', 'Mia', 'Ben', 'Lena', 'Tim', 'Sara', 'Lukas', 'Lisa', 'Paul', 'Jana'],
  es: ['Carlos', 'María', 'José', 'Ana', 'Luis', 'Sara', 'Pedro', 'Lucía', 'Pablo', 'Marta', 'Diego', 'Elena', 'Javier', 'Laura', 'Andrés', 'Clara'],
  nl: ['Daan', 'Emma', 'Sem', 'Julia', 'Liam', 'Sophie', 'Noah', 'Mila', 'Finn', 'Anna', 'Luuk', 'Sara', 'Milan', 'Eva', 'Tim', 'Lotte'],
};

const actionTextKeys: Record<string, string[]> = {
  voted: ['voted', 'participated in voting', 'shared an opinion'],
  suggested: ['suggested an improvement', 'submitted a proposal'],
  proposed: ['proposed a new idea', 'added a proposal'],
};

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomActivity(lang: string): ActivityItem {
  const actions: ('voted' | 'suggested' | 'proposed')[] = ['voted', 'voted', 'voted', 'suggested', 'proposed'];
  const action = getRandomItem(actions);
  const names = namesByLang[lang] || namesByLang.en;

  return {
    id: Math.random().toString(36).substring(7),
    user: getRandomItem(names),
    action,
    textKey: getRandomItem(actionTextKeys[action]),
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
  const { t, currentLanguage } = useTranslation();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    // Add initial activity
    setActivities([generateRandomActivity(currentLanguage)]);

    // Periodically add new activities
    const interval = setInterval(() => {
      setActivities(prev => {
        const newActivity = generateRandomActivity(currentLanguage);
        const updated = [newActivity, ...prev];
        return updated.slice(0, maxItems);
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isActive, maxItems, intervalMs, currentLanguage]);

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

    if (diffSec < 5) return t('now');
    if (diffSec < 60) return t('{{seconds}} seconds ago').replace('{{seconds}}', String(diffSec));
    return t('{{minutes}} minutes ago').replace('{{minutes}}', String(Math.floor(diffSec / 60)));
  };

  if (!isActive || activities.length === 0) return null;

  return (
    <div className={`${styles.container} ${isExpanded ? styles.expanded : ''}`}>
      <button
        className={styles.toggle}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? t('Collapse feed') : t('Expand feed')}
      >
        <span className={styles.toggleIcon}>
          {isExpanded ? '▼' : '▲'}
        </span>
        <span className={styles.toggleText}>
          {t('Community activity')} ({activities.length})
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
            <span className={styles.action}>{t(activity.textKey)}</span>
            <span className={styles.time}>{formatTime(activity.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
