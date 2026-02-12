'use client';

import { useEffect, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
  useHeatMapStore,
  selectAvailableDemographics,
  selectIsDemographicsLoading,
  selectDemographicFilter,
  selectCurrentSegment,
  selectIsDemographicFilterActive,
} from '@/store/heatMapStore';
import { DemographicFilter as DemographicFilterType, DemographicFilterOption } from '@/types/heatMap';
import styles from './DemographicFilter.module.scss';

interface DemographicFilterProps {
  documentId: string;
  className?: string;
}

export default function DemographicFilter({ documentId, className }: DemographicFilterProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<DemographicFilterOption | null>(null);

  // Store state
  const availableDemographics = useHeatMapStore(selectAvailableDemographics);
  const isDemographicsLoading = useHeatMapStore(selectIsDemographicsLoading);
  const demographicFilter = useHeatMapStore(selectDemographicFilter);
  const currentSegment = useHeatMapStore(selectCurrentSegment);
  const isFilterActive = useHeatMapStore(selectIsDemographicFilterActive);

  // Store actions
  const loadAvailableDemographics = useHeatMapStore((state) => state.loadAvailableDemographics);
  const setDemographicFilter = useHeatMapStore((state) => state.setDemographicFilter);
  const clearDemographicFilter = useHeatMapStore((state) => state.clearDemographicFilter);

  // Load demographics on mount
  useEffect(() => {
    console.info('[DemographicFilter] Loading demographics for document:', documentId);
    loadAvailableDemographics(documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // Debug: Log available demographics
  useEffect(() => {
    console.info('[DemographicFilter] Available demographics:', availableDemographics);
    console.info('[DemographicFilter] Is loading:', isDemographicsLoading);
  }, [availableDemographics, isDemographicsLoading]);

  // Sync selected question with filter state
  useEffect(() => {
    if (demographicFilter.questionId) {
      const question = availableDemographics.find(
        (q) => q.questionId === demographicFilter.questionId
      );
      setSelectedQuestion(question || null);
    } else {
      setSelectedQuestion(null);
    }
  }, [demographicFilter.questionId, availableDemographics]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleSelectQuestion = useCallback((question: DemographicFilterOption) => {
    setSelectedQuestion(question);
  }, []);

  const handleSelectSegment = useCallback(
    (question: DemographicFilterOption, option: { value: string; label: string }) => {
      const filter: DemographicFilterType = {
        questionId: question.questionId,
        questionLabel: question.question,
        segmentValue: option.value,
        segmentLabel: option.label,
      };
      setDemographicFilter(filter);
      setIsExpanded(false);
    },
    [setDemographicFilter]
  );

  const handleClearFilter = useCallback(() => {
    clearDemographicFilter();
    setSelectedQuestion(null);
    setIsExpanded(false);
  }, [clearDemographicFilter]);

  const handleBack = useCallback(() => {
    setSelectedQuestion(null);
  }, []);

  // Show message if no demographics available (for debugging)
  const noDemographicsAvailable = !isDemographicsLoading && availableDemographics.length === 0;

  return (
    <div className={clsx(styles.container, isExpanded && styles.expanded, className)}>
      {/* Toggle button */}
      <button
        type="button"
        className={clsx(styles.toggleButton, isFilterActive && styles.active)}
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? t('closeDemographicFilter') : t('openDemographicFilter')}
        disabled={isDemographicsLoading}
      >
        {isDemographicsLoading ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
            <path d="M16 3l2 2-2 2M8 3l-2 2 2 2" />
          </svg>
        )}
      </button>

      {/* Active filter badge */}
      {isFilterActive && currentSegment && !isExpanded && (
        <div className={styles.filterBadge}>
          <span className={styles.badgeText}>
            {currentSegment.segmentLabel}
          </span>
          <span className={styles.badgeCount}>
            ({currentSegment.respondentCount})
          </span>
          <button
            type="button"
            className={styles.clearBadge}
            onClick={handleClearFilter}
            aria-label={t('clearFilter')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded menu */}
      {isExpanded && (
        <div className={styles.menu} role="menu" aria-label={t('demographicFilterMenu')}>
          {/* Header */}
          <div className={styles.menuHeader}>
            {selectedQuestion ? (
              <>
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={handleBack}
                  aria-label={t('back')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className={styles.headerTitle}>{selectedQuestion.question}</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
                <span>{t('filterByDemographic')}</span>
              </>
            )}
          </div>

          <div className={styles.menuDivider} />

          {/* Question list or segment list */}
          {noDemographicsAvailable ? (
            // No demographics available message
            <div className={styles.optionsList}>
              <div className={styles.emptyMessage}>
                No demographic questions with 5+ respondents found.
                <br />
                <small>Enable demographics in Admin &gt; Settings</small>
              </div>
            </div>
          ) : selectedQuestion ? (
            // Segment options
            <div className={styles.optionsList}>
              {selectedQuestion.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  className={clsx(
                    styles.optionButton,
                    demographicFilter.segmentValue === option.value && styles.selected
                  )}
                  onClick={() => handleSelectSegment(selectedQuestion, option)}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  <span className={styles.optionCount}>({option.count})</span>
                </button>
              ))}
            </div>
          ) : (
            // Question list
            <div className={styles.optionsList}>
              {availableDemographics.map((question) => (
                <button
                  key={question.questionId}
                  type="button"
                  role="menuitem"
                  className={clsx(
                    styles.optionButton,
                    demographicFilter.questionId === question.questionId && styles.selected
                  )}
                  onClick={() => handleSelectQuestion(question)}
                >
                  <span className={styles.optionLabel}>{question.question}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Clear filter button */}
          {isFilterActive && (
            <>
              <div className={styles.menuDivider} />
              <button
                type="button"
                role="menuitem"
                className={clsx(styles.optionButton, styles.clearButton)}
                onClick={handleClearFilter}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                <span className={styles.optionLabel}>{t('clearFilter')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
