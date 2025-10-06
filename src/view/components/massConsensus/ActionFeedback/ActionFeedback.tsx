import React, { FC, useState, useEffect } from 'react';
import { PostActionConfig } from 'delib-npm';
import { useNavigate, useParams } from 'react-router';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useExplanations } from '@/contexts/massConsensus/ExplanationProvider';
import styles from './ActionFeedback.module.scss';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';
import X from '@/assets/icons/x.svg?react';
import ArrowRight from '@/assets/icons/arrowRight.svg?react';

interface ActionFeedbackProps {
  stageId: string;
  config?: PostActionConfig;
  suggestionCount?: number;
  onContinue?: () => void;
  onAddAnother?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const ActionFeedback: FC<ActionFeedbackProps> = ({
  stageId,
  config: explicitConfig,
  suggestionCount = 0,
  onContinue,
  onAddAnother,
  onDismiss,
  className
}) => {
  const { t, dir } = useUserConfig();
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const { getPostActionConfig } = useExplanations();

  const [isVisible, setIsVisible] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Get config from context or use explicit one
  const config = explicitConfig || getPostActionConfig(stageId);

  useEffect(() => {
    if (!config?.enabled || !isVisible) return;

    // Handle auto-advance
    if (config.autoAdvance?.enabled && config.autoAdvance.delay) {
      const delayMs = config.autoAdvance.delay;
      setCountdown(Math.ceil(delayMs / 1000));

      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownInterval);
            handleAutoAdvance();
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [config, isVisible]);

  if (!config?.enabled || !isVisible) {
    return null;
  }

  const handleAutoAdvance = () => {
    if (config.autoAdvance?.target === 'next') {
      handleContinue();
    } else if (config.autoAdvance?.targetStageId) {
      navigate(`/mass-consensus/${statementId}/${config.autoAdvance.targetStageId}`);
    }
  };

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 300);
  };

  const handleContinue = () => {
    onContinue?.();
    handleDismiss();
  };

  const handleViewMySuggestions = () => {
    navigate(`/mass-consensus/${statementId}/my-suggestions`);
  };

  const handleAddAnother = () => {
    onAddAnother?.();
    handleDismiss();
  };

  const handleButtonAction = (action: string, customUrl?: string) => {
    switch (action) {
      case 'continue':
        handleContinue();
        break;
      case 'viewMySuggestions':
        handleViewMySuggestions();
        break;
      case 'addAnother':
        handleAddAnother();
        break;
      case 'skip':
        handleContinue();
        break;
      case 'custom':
        if (customUrl) {
          navigate(customUrl);
        }
        break;
      default:
        handleDismiss();
    }
  };

  const renderButtons = () => {
    if (!config.buttons || config.buttons.length === 0) {
      // Default buttons
      return (
        <div className={styles.buttonGroup}>
          <button
            className={`btn btn--secondary`}
            onClick={handleViewMySuggestions}
          >
            {t('View My Suggestions')}
            {suggestionCount > 0 && ` (${suggestionCount})`}
          </button>
          <button
            className={`btn btn--secondary`}
            onClick={handleAddAnother}
          >
            {t('Add Another')}
          </button>
          <button
            className={`btn btn--primary`}
            onClick={handleContinue}
          >
            {t('Continue')}
            <ArrowRight />
          </button>
        </div>
      );
    }

    return (
      <div className={styles.buttonGroup}>
        {config.buttons.map((button, index) => (
          <button
            key={index}
            className={`btn ${button.primary ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => handleButtonAction(button.action, button.customUrl)}
          >
            {t(button.label)}
            {button.action === 'viewMySuggestions' && suggestionCount > 0 && ` (${suggestionCount})`}
            {button.action === 'continue' && <ArrowRight />}
          </button>
        ))}
      </div>
    );
  };

  const displayMode = config.displayMode || 'modal';

  switch (displayMode) {
    case 'modal':
      return (
        <div className={`${styles.feedbackModal} ${isDismissing ? styles.dismissing : ''}`}>
          <div className={styles.modalBackdrop} onClick={handleDismiss} />
          <div className={styles.modalContent} style={{ direction: dir }}>
            <button
              className={styles.closeButton}
              onClick={handleDismiss}
              aria-label={t('Close')}
            >
              <X />
            </button>

            <div className={styles.successAnimation}>
              <div className={styles.checkCircle}>
                <CheckIcon />
              </div>
            </div>

            <div className={styles.modalBody}>
              <h2>{t(config.content)}</h2>
              {config.successMessage && (
                <p className={styles.successMessage}>{t(config.successMessage)}</p>
              )}
              {suggestionCount > 0 && (
                <p className={styles.suggestionCount}>
                  {t('You have submitted')} {suggestionCount} {t('suggestions so far')}
                </p>
              )}
              {countdown !== null && (
                <p className={styles.countdown}>
                  {t('Continuing in')} {countdown}...
                </p>
              )}
            </div>

            <div className={styles.modalFooter}>
              {renderButtons()}
            </div>
          </div>
        </div>
      );

    case 'toast':
      return (
        <div
          className={`${styles.feedbackToast} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
          style={{ direction: dir }}
        >
          <div className={styles.toastContent}>
            <CheckIcon className={styles.toastIcon} />
            <div className={styles.toastText}>
              <p>{t(config.content)}</p>
              {config.successMessage && (
                <span className={styles.toastSubtext}>{t(config.successMessage)}</span>
              )}
            </div>
            {countdown !== null && (
              <span className={styles.toastCountdown}>{countdown}s</span>
            )}
            <button
              className={styles.toastClose}
              onClick={handleDismiss}
              aria-label={t('Close')}
            >
              <X />
            </button>
          </div>
        </div>
      );

    case 'inline':
      return (
        <div
          className={`${styles.feedbackInline} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
          style={{ direction: dir }}
        >
          <div className={styles.inlineHeader}>
            <CheckIcon className={styles.inlineIcon} />
            <h3>{t(config.content)}</h3>
          </div>
          {config.successMessage && (
            <p className={styles.inlineMessage}>{t(config.successMessage)}</p>
          )}
          {renderButtons()}
        </div>
      );

    case 'card':
      return (
        <div
          className={`${styles.feedbackCard} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
          style={{ direction: dir }}
        >
          <div className={styles.cardHeader}>
            <div className={styles.successIcon}>
              <CheckIcon />
            </div>
            <h3>{t(config.content)}</h3>
            <button
              className={styles.cardClose}
              onClick={handleDismiss}
              aria-label={t('Close')}
            >
              <X />
            </button>
          </div>
          {config.successMessage && (
            <p className={styles.cardMessage}>{t(config.successMessage)}</p>
          )}
          {suggestionCount > 0 && (
            <p className={styles.cardCount}>
              {t('Total suggestions')}: {suggestionCount}
            </p>
          )}
          {renderButtons()}
        </div>
      );

    default:
      return null;
  }
};

export default ActionFeedback;