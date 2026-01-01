import { Statement } from '@freedi/shared-types';
import clsx from 'clsx';
import { calculateAgreement, getAgreementColor, getFallbackColor } from '@/lib/utils/consensusColors';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import InlineMarkdown from '../shared/InlineMarkdown';
import styles from './ResultCard.module.scss';

interface ResultCardProps {
  statement: Statement;
  isUserStatement: boolean;
  totalParticipants: number;
}

export default function ResultCard({ statement, isUserStatement, totalParticipants }: ResultCardProps) {
  // Calculate agreement score using the same logic as Triangle
  const { sumPro = 0, sumCon = 0, numberOfEvaluators = 1 } = statement.evaluation || {};
  const agreement = calculateAgreement(sumPro, sumCon, numberOfEvaluators);

  // Get the appropriate color variable based on agreement
  const colorVariable = getAgreementColor(agreement);
  const fallbackColor = getFallbackColor(colorVariable);

  // Calculate metrics
  const participants = statement.evaluation?.numberOfEvaluators || 0;
  const supportCount = statement.evaluation?.sumPro || 0;
  const againstCount = Math.abs(statement.evaluation?.sumCon || 0);

  // Calculate agreement score percentage
  const agreementScore =
    participants > 0 ? Math.round(((supportCount - againstCount) / participants) * 100) : 0;

  // Calculate opacity for badges
  const participationOpacity =
    totalParticipants > 0 ? Math.max(0.3, Math.min(1, participants / totalParticipants)) : 1;

  const supportOpacity =
    participants > 0
      ? supportCount === 0
        ? 0.15
        : Math.max(0.35, Math.min(1, supportCount / participants))
      : 0.15;

  const againstOpacity =
    participants > 0
      ? againstCount === 0
        ? 0.15
        : Math.max(0.35, Math.min(1, againstCount / participants))
      : 0.15;

  // Style object with dynamic border color
  const cardStyle: React.CSSProperties = {
    borderLeftColor: `var(${colorVariable}, ${fallbackColor})`,
  };

  return (
    <div
      className={clsx(styles.resultCard, isUserStatement && styles['resultCard--user'])}
      style={cardStyle}
    >
      <div className={styles.resultCard__content}>
        {isUserStatement && (
          <div className={styles.resultCard__badgeRow}>
            <span className={styles.resultCard__userBadge}>Your suggestion</span>
          </div>
        )}
        <div className={styles.resultCard__text}>
          <h3 className={styles.resultCard__title}>
            <InlineMarkdown text={statement.statement} />
          </h3>
          {getParagraphsText(statement.paragraphs) && (
            <p className={styles.resultCard__description}>
              <InlineMarkdown text={getParagraphsText(statement.paragraphs)} />
            </p>
          )}
        </div>
      </div>
      <div className={styles.resultCard__metrics}>
        <div className={styles.metrics}>
          {/* Left side - Consensus score */}
          <div className={styles.consensusScore}>
            <span
              className={clsx(
                styles.consensusScore__value,
                agreementScore < 0 && styles['consensusScore__value--negative']
              )}
            >
              {agreementScore}%
            </span>
            <span className={styles.consensusScore__label}>Consensus score</span>
          </div>

          {/* Right side - Badges */}
          <div className={styles.badges}>
            {/* Participants badge */}
            <div className={clsx(styles.badge, styles['badge--participants'])}>
              <span className={styles.badge__label}>Voted</span>
              <span className={styles.badge__value}>
                <span
                  className={styles.badge__background}
                  style={{
                    backgroundColor: 'var(--option)',
                    opacity: participationOpacity,
                  }}
                />
                <span className={styles.badge__number}>{participants}</span>
              </span>
            </div>

            {/* Support badge */}
            <div className={clsx(styles.badge, styles['badge--support'])}>
              <span className={styles.badge__label}>Support</span>
              <div className={styles.badge__iconValue}>
                <span
                  className={styles.badge__background}
                  style={{
                    backgroundColor: 'var(--approve)',
                    opacity: supportOpacity,
                  }}
                />
                <div className={styles.badge__iconContainer}>
                  <ThumbUpIcon />
                </div>
                <span className={styles.badge__valueText}>{supportCount.toFixed(1)}</span>
              </div>
            </div>

            {/* Against badge */}
            <div className={clsx(styles.badge, styles['badge--against'])}>
              <span className={styles.badge__label}>Against</span>
              <div className={styles.badge__iconValue}>
                <span
                  className={styles.badge__background}
                  style={{
                    backgroundColor: 'var(--reject)',
                    opacity: againstOpacity,
                  }}
                />
                <div className={styles.badge__iconContainer}>
                  <ThumbDownIcon />
                </div>
                <span className={styles.badge__valueText}>{againstCount.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple thumb icons as SVG components
function ThumbUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
    </svg>
  );
}
