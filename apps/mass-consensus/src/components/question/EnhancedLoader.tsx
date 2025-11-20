'use client';

import { useEffect, useState } from 'react';
import type { LoadingStage } from '@/types/api';
import { UI, LOADER_STAGES, PROGRESS, API } from '@/constants/common';
import styles from './EnhancedLoader.module.scss';

interface EnhancedLoaderProps {
  onCancel?: () => void;
}

interface StageConfig {
  stage: LoadingStage;
  icon: string;
  message: string;
  subMessage: string;
  tip: string;
  progressStart: number;
  progressEnd: number;
  duration: number; // seconds
}

const STAGES: StageConfig[] = [
  {
    stage: 'content-check',
    icon: '🔍',
    message: 'Checking for inappropriate content...',
    subMessage: 'Ensuring safe community standards',
    tip: 'AI scans for profanity and harmful content',
    ...LOADER_STAGES.CONTENT_CHECK,
  },
  {
    stage: 'similarity-search',
    icon: '👥',
    message: 'Finding similar solutions...',
    subMessage: 'Searching through community ideas',
    tip: 'Similar ideas are grouped to show consensus',
    ...LOADER_STAGES.SIMILARITY_SEARCH,
  },
  {
    stage: 'comparison',
    icon: '📊',
    message: 'Comparing with existing solutions...',
    subMessage: 'Analyzing similarity scores',
    tip: 'This helps prevent duplicate suggestions',
    ...LOADER_STAGES.COMPARISON,
  },
  {
    stage: 'finalizing',
    icon: '✨',
    message: 'Almost ready...',
    subMessage: 'Preparing your results',
    tip: 'Great solutions deserve careful review!',
    ...LOADER_STAGES.FINALIZING,
  },
];

export default function EnhancedLoader({ onCancel }: EnhancedLoaderProps) {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Ensure stage index is always valid
  const safeStageIndex = Math.min(currentStageIndex, STAGES.length - 1);
  const currentStage = STAGES[safeStageIndex];

  useEffect(() => {
    // Update elapsed time every second
    const timeInterval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, UI.LOADER_TIME_UPDATE_INTERVAL);

    return () => {
      clearInterval(timeInterval);
    };
  }, []);

  useEffect(() => {
    // Progress animation within current stage
    const progressInterval = setInterval(() => {
      const stage = STAGES[safeStageIndex];

      setProgress((prev) => {
        const newProgress = prev + PROGRESS.INCREMENT_PERCENT;

        // Cap at 100%
        if (newProgress >= PROGRESS.MAX_PERCENT) {
          return PROGRESS.MAX_PERCENT;
        }

        // Check if we should move to next stage
        if (
          newProgress >= stage.progressEnd &&
          safeStageIndex < STAGES.length - 1
        ) {
          // Schedule stage transition separately
          queueMicrotask(() => {
            setCurrentStageIndex((idx) => Math.min(idx + 1, STAGES.length - 1));
          });
          return stage.progressEnd;
        }

        return newProgress;
      });
    }, UI.LOADER_TICK_INTERVAL);

    return () => {
      clearInterval(progressInterval);
    };
  }, [safeStageIndex]);

  const showCancelButton = elapsedTime > UI.LOADER_CANCEL_THRESHOLD;

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Animated Icon */}
        <div className={styles.iconContainer}>
          <div className={styles.icon} key={safeStageIndex}>
            {currentStage.icon}
          </div>
        </div>

        {/* Pulsing Dots */}
        <div className={styles.dotsLoader}>
          <div className={styles.dot} />
          <div className={styles.dot} />
          <div className={styles.dot} />
        </div>

        {/* Progress Bar */}
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Progress Percentage */}
        <div className={styles.progressText}>{Math.round(progress)}%</div>

        {/* Main Message */}
        <h2 className={styles.mainMessage}>{currentStage.message}</h2>

        {/* Sub Message */}
        <p className={styles.subMessage}>{currentStage.subMessage}</p>

        {/* Duration Info */}
        <p className={styles.durationInfo}>{API.MAX_DURATION_MESSAGE}</p>

        {/* Educational Tip */}
        <div className={styles.tipContainer} key={currentStage.tip}>
          <span className={styles.tipIcon}>⚡</span>
          <p className={styles.tipText}>
            <strong>Did you know?</strong> {currentStage.tip}
          </p>
        </div>

        {/* Stage Indicators */}
        <div className={styles.stageIndicators}>
          {STAGES.map((stage, index) => (
            <div key={stage.stage} className={styles.stageIndicator}>
              <div className={styles.stageIcon}>{stage.icon}</div>
              <div
                className={`${styles.stageDot} ${
                  index === safeStageIndex ? styles.active : ''
                } ${index < safeStageIndex ? styles.completed : ''}`}
              />
            </div>
          ))}
        </div>

        {/* Cancel Button (shows after 30s) */}
        {showCancelButton && onCancel && (
          <div className={styles.cancelContainer}>
            <p className={styles.takingLonger}>Taking a bit longer than usual...</p>
            <button onClick={onCancel} className={styles.cancelButton}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
