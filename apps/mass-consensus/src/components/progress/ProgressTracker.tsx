'use client';

import React, { useState, useEffect } from 'react';
import styles from './ProgressTracker.module.scss';

interface ProgressTrackerProps {
  evaluationCount: number;
  totalEvaluations?: number;
  streak?: number;
  level?: number;
  achievements?: string[];
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  evaluationCount,
  totalEvaluations = 100,
  streak = 0,
  level = 1,
  achievements = []
}) => {
  const [showCelebration, setShowCelebration] = useState(false);
  const progressPercentage = (evaluationCount / totalEvaluations) * 100;
  const nextLevelThreshold = level * 10;

  useEffect(() => {
    if (evaluationCount > 0 && evaluationCount % 10 === 0) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }
  }, [evaluationCount]);

  const getStreakIntensity = () => {
    if (streak >= 7) return 'fire-intense';
    if (streak >= 3) return 'fire-medium';
    if (streak >= 1) return 'fire-small';
    return '';
  };

  return (
    <div className={styles.progressTracker}>
      {/* Streak Counter */}
      <div className={styles.streakSection}>
        <div className={`${styles.streakCounter} ${styles[getStreakIntensity()]}`}>
          <span className={styles.streakEmoji}>🔥</span>
          <span className={styles.streakNumber}>{streak}</span>
          <span className={styles.streakLabel}>day streak!</span>
        </div>
      </div>

      {/* Level Progress */}
      <div className={styles.levelSection}>
        <div className={styles.levelHeader}>
          <span className={styles.levelBadge}>Level {level}</span>
          <span className={styles.xpText}>
            {evaluationCount}/{nextLevelThreshold} XP
          </span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progressPercentage}%` }}
          >
            <span className={styles.progressGlow}></span>
          </div>
          {/* Milestone Markers */}
          <div className={styles.milestones}>
            <span className={styles.milestone} style={{ left: '25%' }}>🌟</span>
            <span className={styles.milestone} style={{ left: '50%' }}>⭐</span>
            <span className={styles.milestone} style={{ left: '75%' }}>✨</span>
          </div>
        </div>
      </div>

      {/* Daily Goal */}
      <div className={styles.dailyGoal}>
        <span className={styles.goalIcon}>🎯</span>
        <span className={styles.goalText}>
          Daily Goal: {Math.min(evaluationCount, 10)}/10 evaluations
        </span>
        {evaluationCount >= 10 && (
          <span className={styles.goalComplete}>✅</span>
        )}
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className={styles.achievements}>
          <h4 className={styles.achievementsTitle}>Recent Achievements</h4>
          <div className={styles.achievementsList}>
            {achievements.slice(0, 3).map((achievement, index) => (
              <div
                key={index}
                className={styles.achievementBadge}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <span className={styles.achievementIcon}>🏆</span>
                <span className={styles.achievementText}>{achievement}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Celebration Animation */}
      {showCelebration && (
        <div className={styles.celebration}>
          <span className={styles.confetti}>🎉</span>
          <span className={styles.confetti}>🎊</span>
          <span className={styles.confetti}>✨</span>
          <span className={styles.confetti}>🌟</span>
          <span className={styles.confetti}>🎆</span>
        </div>
      )}
    </div>
  );
};

export default ProgressTracker;