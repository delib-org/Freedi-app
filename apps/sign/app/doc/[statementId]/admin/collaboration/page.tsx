'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
  CollaborationIndexData,
  ParagraphCollaborationData,
  SegmentData,
  CollaborationFilter,
  CollaborationSort,
} from '@/types/collaboration';
import styles from './collaboration.module.scss';

export default function CollaborationIndexPage() {
  const params = useParams();
  const statementId = params?.statementId as string;
  const { t } = useTranslation();

  const [data, setData] = useState<CollaborationIndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CollaborationFilter>('all');
  const [sort, setSort] = useState<CollaborationSort>('divergence');
  const [selectedParagraph, setSelectedParagraph] = useState<ParagraphCollaborationData | null>(null);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/collaboration/${statementId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch collaboration data');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    if (statementId) {
      fetchData();
    }
  }, [statementId]);

  // Filter and sort paragraphs
  const filteredParagraphs = useCallback(() => {
    if (!data?.paragraphs) return [];

    let result = [...data.paragraphs];

    // Apply filter
    if (filter !== 'all') {
      result = result.filter((p) => p.collaborationStatus === filter);
    }

    // Apply sort
    result.sort((a, b) => {
      switch (sort) {
        case 'divergence':
          return b.divergenceScore - a.divergenceScore;
        case 'approval':
          return b.overallApproval - a.overallApproval;
        case 'comments':
          return b.totalComments - a.totalComments;
        case 'order':
          return a.paragraphIndex - b.paragraphIndex;
        default:
          return 0;
      }
    });

    return result;
  }, [data?.paragraphs, filter, sort]);

  const handleParagraphClick = useCallback((paragraph: ParagraphCollaborationData) => {
    setSelectedParagraph(paragraph);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedParagraph(null);
  }, []);

  const handleNavigateParagraph = useCallback((direction: 'prev' | 'next') => {
    if (!selectedParagraph || !data?.paragraphs) return;

    const paragraphs = filteredParagraphs();
    const currentIndex = paragraphs.findIndex(
      (p) => p.paragraphId === selectedParagraph.paragraphId
    );

    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < paragraphs.length) {
      setSelectedParagraph(paragraphs[newIndex]);
    }
  }, [selectedParagraph, data?.paragraphs, filteredParagraphs]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data?.demographicQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.noData}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2>{t('noDemographicQuestions')}</h2>
          <p>{t('noDemographicQuestionsDescription')}</p>
        </div>
      </div>
    );
  }

  const paragraphs = filteredParagraphs();

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>{t('collaborationIndex')}</h1>
        <p className={styles.subtitle}>
          {t('collaborationIndexDescription')}
        </p>
      </header>

      {/* Summary Cards */}
      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{data.totalParagraphs}</span>
          <span className={styles.summaryLabel}>{t('totalParagraphs')}</span>
        </div>
        <div className={`${styles.summaryCard} ${styles.polarized}`}>
          <span className={styles.summaryValue}>{data.polarizedCount}</span>
          <span className={styles.summaryLabel}>{t('polarized')}</span>
        </div>
        <div className={`${styles.summaryCard} ${styles.mixed}`}>
          <span className={styles.summaryValue}>{data.mixedCount}</span>
          <span className={styles.summaryLabel}>{t('mixed')}</span>
        </div>
        <div className={`${styles.summaryCard} ${styles.collaborative}`}>
          <span className={styles.summaryValue}>{data.collaborativeCount}</span>
          <span className={styles.summaryLabel}>{t('collaborative')}</span>
        </div>
      </div>

      {/* Demographic Question Info */}
      <div className={styles.questionInfo}>
        <span className={styles.questionLabel}>{t('analyzingBy')}:</span>
        <span className={styles.questionText}>{data.demographicQuestion.question}</span>
      </div>

      {/* Filters and Sort */}
      <div className={styles.controls}>
        <div className={styles.filters}>
          {(['all', 'polarized', 'mixed', 'collaborative'] as CollaborationFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(f)}
              {f !== 'all' && (
                <span className={styles.filterCount}>
                  {f === 'polarized' ? data.polarizedCount :
                   f === 'mixed' ? data.mixedCount :
                   data.collaborativeCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.sortContainer}>
          <label htmlFor="sort">{t('sortBy')}:</label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as CollaborationSort)}
            className={styles.sortSelect}
          >
            <option value="divergence">{t('polarizationLevel')}</option>
            <option value="approval">{t('approvalRate')}</option>
            <option value="comments">{t('commentCount')}</option>
            <option value="order">{t('paragraphOrder')}</option>
          </select>
        </div>
      </div>

      {/* Paragraphs Grid */}
      <div className={styles.paragraphsGrid}>
        {paragraphs.map((paragraph) => (
          <ParagraphCard
            key={paragraph.paragraphId}
            paragraph={paragraph}
            segments={data.demographicQuestion?.options || []}
            onClick={() => handleParagraphClick(paragraph)}
          />
        ))}
        {paragraphs.length === 0 && (
          <div className={styles.noParagraphs}>
            <p>{t('noParagraphsMatchFilter')}</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedParagraph && (
        <ParagraphDetailModal
          paragraph={selectedParagraph}
          demographicQuestion={data.demographicQuestion}
          onClose={handleCloseModal}
          onNavigate={handleNavigateParagraph}
          currentIndex={paragraphs.findIndex(p => p.paragraphId === selectedParagraph.paragraphId)}
          totalCount={paragraphs.length}
        />
      )}
    </div>
  );
}

// ============================================
// ParagraphCard Component
// ============================================

interface ParagraphCardProps {
  paragraph: ParagraphCollaborationData;
  segments: Array<{ option: string; color?: string }>;
  onClick: () => void;
}

function ParagraphCard({ paragraph, segments, onClick }: ParagraphCardProps) {
  const { t } = useTranslation();
  const statusClass = styles[paragraph.collaborationStatus];

  return (
    <button type="button" className={`${styles.card} ${statusClass}`} onClick={onClick}>
      <div className={styles.cardHeader}>
        <span className={styles.paragraphNumber}>§{paragraph.paragraphIndex}</span>
        <span className={`${styles.statusBadge} ${statusClass}`}>
          {t(paragraph.collaborationStatus)}
        </span>
      </div>

      <div className={styles.cardContent}>
        <p className={styles.cardText}>
          {paragraph.paragraphText.substring(0, 150)}
          {paragraph.paragraphText.length > 150 ? '...' : ''}
        </p>

        <div className={styles.segmentBars}>
          {paragraph.segments.map((segment) => (
            <SegmentMiniBar
              key={segment.segmentId}
              segment={segment}
              color={segments.find(s => s.option === segment.segmentValue)?.color}
            />
          ))}
        </div>
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.divergence}>
          {paragraph.divergenceScore.toFixed(2)}
        </span>
        <span className={styles.comments}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {paragraph.totalComments}
        </span>
      </div>
    </button>
  );
}

// ============================================
// SegmentMiniBar Component
// ============================================

interface SegmentMiniBarProps {
  segment: SegmentData;
  color?: string;
}

function SegmentMiniBar({ segment, color }: SegmentMiniBarProps) {
  const approvalPercent = Math.round(segment.approvalRate * 100);
  const defaultColor = '#6366f1';

  return (
    <div className={styles.segmentMiniBar}>
      <span className={styles.segmentLabel}>{segment.segmentValue}</span>
      <div className={styles.barContainer}>
        <div
          className={styles.barFill}
          style={{
            width: `${approvalPercent}%`,
            backgroundColor: color || defaultColor,
          }}
        />
      </div>
      <span className={styles.barValue}>{approvalPercent}%</span>
    </div>
  );
}

// ============================================
// ParagraphDetailModal Component
// ============================================

interface ParagraphDetailModalProps {
  paragraph: ParagraphCollaborationData;
  demographicQuestion: {
    questionId: string;
    question: string;
    options: Array<{ option: string; color?: string }>;
  };
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  currentIndex: number;
  totalCount: number;
}

function ParagraphDetailModal({
  paragraph,
  demographicQuestion,
  onClose,
  onNavigate,
  currentIndex,
  totalCount,
}: ParagraphDetailModalProps) {
  const { t } = useTranslation();
  const statusClass = styles[paragraph.collaborationStatus];

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate('prev');
      if (e.key === 'ArrowRight') onNavigate('next');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span className={styles.paragraphNumber}>§{paragraph.paragraphIndex}</span>
            <span className={styles.modalNav}>
              {currentIndex + 1} / {totalCount}
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Paragraph Text */}
        <div className={styles.paragraphContent}>
          <p>{paragraph.paragraphText}</p>
        </div>

        {/* Status Badge */}
        <div className={styles.statusSection}>
          <span className={`${styles.statusBadgeLarge} ${statusClass}`}>
            {t(paragraph.collaborationStatus).toUpperCase()}
          </span>
        </div>

        {/* Divergence Spectrum */}
        <div className={styles.spectrumSection}>
          <h3>{t('divergenceSpectrum')}</h3>
          <DivergenceSpectrum value={paragraph.divergenceScore} />
          <div className={styles.spectrumLabels}>
            <span>{t('consensus')}</span>
            <span>{t('polarized')}</span>
          </div>
        </div>

        {/* Segment Breakdown */}
        <div className={styles.segmentSection}>
          <h3>{t('segmentBreakdown')}: {demographicQuestion.question}</h3>
          <div className={styles.segmentList}>
            {paragraph.segments.map((segment) => {
              const color = demographicQuestion.options.find(
                (o) => o.option === segment.segmentValue
              )?.color;

              return (
                <SegmentDetailCard
                  key={segment.segmentId}
                  segment={segment}
                  color={color}
                />
              );
            })}
          </div>
        </div>

        {/* Comparison Chart */}
        <div className={styles.comparisonSection}>
          <h3>{t('segmentComparison')}</h3>
          <ComparisonChart
            segments={paragraph.segments}
            options={demographicQuestion.options}
          />
        </div>

        {/* Navigation */}
        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => onNavigate('prev')}
            disabled={currentIndex === 0}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('previous')}
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => onNavigate('next')}
            disabled={currentIndex === totalCount - 1}
          >
            {t('next')}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DivergenceSpectrum Component
// ============================================

interface DivergenceSpectrumProps {
  value: number;
}

function DivergenceSpectrum({ value }: DivergenceSpectrumProps) {
  // Value is 0-1, position marker accordingly
  const position = Math.min(Math.max(value * 100, 0), 100);

  return (
    <div className={styles.spectrum}>
      <div className={styles.spectrumTrack}>
        <div
          className={styles.spectrumMarker}
          style={{ left: `${position}%` }}
        >
          <span className={styles.markerValue}>{value.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SegmentDetailCard Component
// ============================================

interface SegmentDetailCardProps {
  segment: SegmentData;
  color?: string;
}

function SegmentDetailCard({ segment, color }: SegmentDetailCardProps) {
  const { t } = useTranslation();
  const approvalPercent = Math.round(segment.approvalRate * 100);
  const defaultColor = '#6366f1';
  const segmentColor = color || defaultColor;

  return (
    <div className={styles.segmentCard}>
      <div className={styles.segmentHeader}>
        <span
          className={styles.segmentDot}
          style={{ backgroundColor: segmentColor }}
        />
        <span className={styles.segmentName}>{segment.segmentValue}</span>
        <span className={styles.segmentUsers}>({segment.userCount} {t('users')})</span>
      </div>

      <div className={styles.segmentBarLarge}>
        <div
          className={styles.segmentBarFill}
          style={{
            width: `${approvalPercent}%`,
            backgroundColor: segmentColor,
          }}
        />
        <span className={styles.segmentBarLabel}>{approvalPercent}% {t('approve')}</span>
      </div>

      <div className={styles.segmentStats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('internalAgreement')}:</span>
          <span className={`${styles.statValue} ${styles[segment.internalAgreement]}`}>
            {t(segment.internalAgreement)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>MAD:</span>
          <span className={styles.statValue}>{segment.mad.toFixed(2)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('comments')}:</span>
          <span className={styles.statValue}>{segment.commentCount}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ComparisonChart Component
// ============================================

interface ComparisonChartProps {
  segments: SegmentData[];
  options: Array<{ option: string; color?: string }>;
}

function ComparisonChart({ segments, options }: ComparisonChartProps) {
  const defaultColor = '#6366f1';

  return (
    <div className={styles.comparisonChart}>
      {segments.map((segment) => {
        const color = options.find((o) => o.option === segment.segmentValue)?.color || defaultColor;
        // Mean is -1 to 1, convert to 0-100 for positioning
        const meanPosition = ((segment.meanApproval + 1) / 2) * 100;
        // MAD determines the width of the spread indicator
        const spreadWidth = segment.mad * 50; // Scale for visibility

        return (
          <div key={segment.segmentId} className={styles.comparisonRow}>
            <span className={styles.comparisonLabel}>{segment.segmentValue}</span>
            <div className={styles.comparisonTrack}>
              {/* Spread indicator (whisker) */}
              <div
                className={styles.comparisonSpread}
                style={{
                  left: `${Math.max(meanPosition - spreadWidth, 0)}%`,
                  width: `${Math.min(spreadWidth * 2, 100 - Math.max(meanPosition - spreadWidth, 0))}%`,
                  backgroundColor: `${color}40`,
                }}
              />
              {/* Mean dot */}
              <div
                className={styles.comparisonDot}
                style={{
                  left: `${meanPosition}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
      <div className={styles.comparisonAxis}>
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
