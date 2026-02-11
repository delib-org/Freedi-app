'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { QuestionSuggestionsData } from '@/types/mySuggestions';
import SuggestionCard from './SuggestionCard';
import styles from './MySuggestionsPage.module.scss';

interface QuestionSectionProps {
  data: QuestionSuggestionsData;
  /** If true, renders as collapsible accordion */
  collapsible: boolean;
  /** If collapsible, whether initially expanded */
  defaultExpanded?: boolean;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${expanded ? styles['chevron--expanded'] : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

/**
 * Calculate max evaluators across all suggestions in a section
 */
function calculateTotalParticipants(data: QuestionSuggestionsData): number {
  return data.suggestions.reduce((max, s) => {
    const evaluators = s.suggestion.evaluation?.numberOfEvaluators ?? 0;

    return Math.max(max, evaluators);
  }, 0);
}

export default function QuestionSection({ data, collapsible, defaultExpanded = true }: QuestionSectionProps) {
  const { t, tWithParams } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const totalParticipants = calculateTotalParticipants(data);

  const headerClass = [
    styles.sectionHeader,
    expanded ? styles['sectionHeader--expanded'] : '',
    !collapsible ? styles['sectionHeader--static'] : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.questionSection}>
      <button
        className={headerClass}
        onClick={collapsible ? () => setExpanded(!expanded) : undefined}
        aria-expanded={expanded}
        type="button"
      >
        <span className={styles.questionPill}>
          {tWithParams('questionNumber', { number: data.questionIndex + 1 })}
        </span>
        <span className={styles.questionText}>{data.question.statement}</span>
        <span className={styles.suggestionCountBadge}>
          {data.suggestions.length}
        </span>
        {collapsible && <ChevronIcon expanded={expanded} />}
      </button>

      <div className={`${styles.sectionContent} ${expanded ? styles['sectionContent--expanded'] : ''}`}>
        <div className={styles.sectionContentInner}>
          <div className={styles.suggestionsList}>
            {data.suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.suggestion.statementId}
                data={suggestion}
                totalParticipants={totalParticipants}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
