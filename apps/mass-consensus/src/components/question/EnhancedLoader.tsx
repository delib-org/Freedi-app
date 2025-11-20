'use client';

import { useEffect, useState } from 'react';
import type { LoadingStage } from '@/types/api';
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
    progressStart: 0,
    progressEnd: 25,
    duration: 8,
  },
  {
    stage: 'similarity-search',
    icon: '👥',
    message: 'Finding similar solutions...',
    subMessage: 'Searching through community ideas',
    tip: 'Similar ideas are grouped to show consensus',
    progressStart: 25,
    progressEnd: 60,
    duration: 10,
  },
  {
    stage: 'comparison',
    icon: '📊',
    message: 'Comparing with existing solutions...',
    subMessage: 'Analyzing similarity scores',
    tip: 'This helps prevent duplicate suggestions',
    progressStart: 60,
    progressEnd: 85,
    duration: 7,
  },
  {
    stage: 'finalizing',
    icon: '✨',
    message: 'Almost ready...',
    subMessage: 'Preparing your results',
    tip: 'Great solutions deserve careful review!',
    progressStart: 85,
    progressEnd: 100,
    duration: 5,
  },
];

export default function EnhancedLoader({ onCancel }: EnhancedLoaderProps) {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const currentStage = STAGES[currentStageIndex];

  useEffect(() => {
    // Update elapsed time every second
    const timeInterval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    // Progress animation within current stage
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + 0.5; // Increment by 0.5% every 150ms
        const stage = STAGES[currentStageIndex];

        // Cap at 100%
        if (newProgress >= 100) {
          return 100;
        }

        // Check if we should move to next stage
        if (newProgress >= stage.progressEnd && currentStageIndex < STAGES.length - 1) {
          // Schedule stage transition for next tick to avoid setState during render
          setTimeout(() => setCurrentStageIndex((idx) => idx + 1), 0);
          return stage.progressEnd;
        }

        return newProgress;
      });
    }, 150);

    return () => {
      clearInterval(timeInterval);
      clearInterval(progressInterval);
    };
  }, [currentStageIndex]);

  const showCancelButton = elapsedTime > 30;

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Animated Icon */}
        <div className={styles.iconContainer}>
          <div className={styles.icon} key={currentStageIndex}>
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
        <p className={styles.durationInfo}>This may take up to 30 seconds</p>

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
                  index === currentStageIndex ? styles.active : ''
                } ${index < currentStageIndex ? styles.completed : ''}`}
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
