'use client';

import { useState, useEffect } from 'react';
import styles from './ProgressTracker.module.scss';

interface ProgressTrackerProps {
  currentStreak: number;
  totalEvaluations: number;
  todayEvaluations: number;
  level: number;
  nextLevelProgress: number;
  achievements: Achievement[];
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}

/**
 * Gamified Progress Tracker Component
 * Shows user's progress, streak, achievements and level
 */
export default function ProgressTracker({
  currentStreak,
  totalEvaluations,
  todayEvaluations,
  level,
  nextLevelProgress,
  achievements
}: ProgressTrackerProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);

  // Check for new achievements
  useEffect(() => {
    const recentAchievement = achievements.find(
      a => a.unlocked && a.unlockedAt && Date.now() - a.unlockedAt < 5000
    );
    if (recentAchievement) {
      setNewAchievement(recentAchievement);
      setShowCelebration(true);
      setTimeout(() => {
        setShowCelebration(false);
        setNewAchievement(null);
      }, 4000);
    }
  }, [achievements]);

  // Milestone markers for progress bar
  const milestones = [0, 25, 50, 75, 100];

  // Calculate streak fire intensity
  const getFireIntensity = () => {
    if (currentStreak >= 7) return styles.fireHot;
    if (currentStreak >= 3) return styles.fireWarm;
    return styles.fireCool;
  };

  return (
    <div className={styles.container}>
      {/* Streak Counter */}
      <div className={styles.streakSection}>
        <div className={`${styles.streakBadge} ${getFireIntensity()}`}>
          <span className={styles.fireEmoji}>🔥</span>
          <div className={styles.streakInfo}>
            <span className={styles.streakNumber}>{currentStreak}</span>
            <span className={styles.streakLabel}>Day Streak!</span>
          </div>
        </div>

        {currentStreak >= 3 && (
          <div className={styles.streakBonus}>
            +{Math.floor(currentStreak / 3) * 10}% XP Bonus!
          </div>
        )}
      </div>

      {/* Level & Progress */}
      <div className={styles.levelSection}>
        <div className={styles.levelHeader}>
          <div className={styles.levelBadge}>
            <span className={styles.levelIcon}>⭐</span>
            <span className={styles.levelNumber}>Level {level}</span>
          </div>
          <div className={styles.levelStats}>
            <span>{totalEvaluations} Total</span>
            <span className={styles.dot}>•</span>
            <span>{todayEvaluations} Today</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${nextLevelProgress}%` }}
            >
              <span className={styles.progressGlow}></span>
            </div>

            {/* Milestone Markers */}
            {milestones.map((milestone) => (
              <div
                key={milestone}
                className={`${styles.milestone} ${
                  nextLevelProgress >= milestone ? styles.achieved : ''
                }`}
                style={{ left: `${milestone}%` }}
              >
                {nextLevelProgress >= milestone && (
                  <span className={styles.milestoneIcon}>✨</span>
                )}
              </div>
            ))}
          </div>

          <div className={styles.progressLabel}>
            {nextLevelProgress}% to Level {level + 1}
          </div>
        </div>
      </div>

      {/* Recent Achievements */}
      <div className={styles.achievementsSection}>
        <h4 className={styles.achievementsTitle}>Recent Achievements</h4>
        <div className={styles.achievementsList}>
          {achievements.slice(0, 3).map((achievement) => (
            <div
              key={achievement.id}
              className={`${styles.achievementBadge} ${
                achievement.unlocked ? styles.unlocked : styles.locked
              }`}
              title={achievement.description}
            >
              <span className={styles.achievementIcon}>
                {achievement.icon}
              </span>
              <span className={styles.achievementName}>
                {achievement.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Celebration Animation */}
      {showCelebration && newAchievement && (
        <div className={styles.celebrationOverlay}>
          <div className={styles.achievementUnlock}>
            <div className={styles.unlockIcon}>{newAchievement.icon}</div>
            <h3 className={styles.unlockTitle}>Achievement Unlocked!</h3>
            <p className={styles.unlockName}>{newAchievement.title}</p>
            <p className={styles.unlockDescription}>
              {newAchievement.description}
            </p>
            <div className={styles.confetti}>
              {[...Array(12)].map((_, i) => (
                <span key={i} className={styles.confettiPiece} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Daily Goal Indicator */}
      <div className={styles.dailyGoal}>
        <div className={styles.goalProgress}>
          <span className={styles.goalIcon}>🎯</span>
          <div className={styles.goalBar}>
            <div
              className={styles.goalFill}
              style={{ width: `${Math.min((todayEvaluations / 10) * 100, 100)}%` }}
            />
          </div>
          <span className={styles.goalText}>
            {todayEvaluations}/10 Daily Goal
          </span>
        </div>

        {todayEvaluations >= 10 && (
          <div className={styles.goalComplete}>
            Daily Goal Complete! 🎉
          </div>
        )}
      </div>
    </div>
  );
}