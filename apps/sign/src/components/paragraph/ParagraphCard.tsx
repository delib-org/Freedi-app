'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { ParagraphType, HeaderColors, DEFAULT_HEADER_COLORS } from '@/types';
import clsx from 'clsx';
import { Paragraph } from '@/types';
import { useUIStore, UIState } from '@/store/uiStore';
import { useAccessibilityStore } from '@/store/accessibilityStore';
import { useParagraphHeatValue } from '@/hooks/useHeatMap';
import { useViewportTracking } from '@/hooks/useViewportTracking';
import { sanitizeHTML } from '@/lib/utils/sanitize';
import { logError } from '@/lib/utils/errorHandling';
import InteractionBar from './InteractionBar';
import styles from './ParagraphCard.module.scss';

interface ParagraphCardProps {
  paragraph: Paragraph;
  documentId: string;
  isApproved: boolean | undefined;
  isLoggedIn: boolean;
  heatLevel?: 'low' | 'medium' | 'high';
  viewCount?: number;
  isAdmin?: boolean;
  commentCount?: number;
  suggestionCount?: number;
  enableSuggestions?: boolean;
  hasInteracted?: boolean;
  onNonInteractiveToggle?: (paragraphId: string, isNonInteractive: boolean) => void;
  /** When true, shows ghosted interaction buttons always (for elderly users / accessibility) */
  enhancedVisibility?: boolean;
  /** When true, headers (h1-h6) will show interaction buttons like other paragraphs */
  allowHeaderReactions?: boolean;
  /** Custom colors for each heading level */
  headerColors?: HeaderColors;
  /** When true, non-interactive paragraphs use normal text color instead of dimmed/disabled styling */
  nonInteractiveNormalStyle?: boolean;
  /** Optional heading number to display (e.g., "1.2.1") */
  headingNumber?: string;
  /** When true, users must sign in with Google to interact */
  requireGoogleLogin?: boolean;
  /** Whether the current user is anonymous */
  isAnonymous?: boolean;
}

export default function ParagraphCard({
  paragraph,
  documentId,
  isApproved: initialApproval,
  isLoggedIn,
  heatLevel,
  viewCount,
  isAdmin,
  commentCount: initialCommentCount = 0,
  suggestionCount: initialSuggestionCount = 0,
  enableSuggestions = false,
  hasInteracted: initialHasInteracted = false,
  onNonInteractiveToggle,
  enhancedVisibility = false,
  allowHeaderReactions = false,
  headerColors = DEFAULT_HEADER_COLORS,
  nonInteractiveNormalStyle = false,
  headingNumber,
  requireGoogleLogin = false,
  isAnonymous = false,
}: ParagraphCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNonInteractive, setIsNonInteractive] = useState(paragraph.isNonInteractive || false);
  const [isTogglingNonInteractive, setIsTogglingNonInteractive] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const paragraphType = paragraph.type || ParagraphType.paragraph;

  // Check if this is a header element
  const isHeader = [
    ParagraphType.h1,
    ParagraphType.h2,
    ParagraphType.h3,
    ParagraphType.h4,
    ParagraphType.h5,
    ParagraphType.h6,
  ].includes(paragraphType);

  // Headers are non-interactive unless allowHeaderReactions is true
  // Non-interactive state is: manually set OR (is header AND header reactions not allowed)
  const effectiveNonInteractive = isNonInteractive || (isHeader && !allowHeaderReactions);

  // Check if high contrast mode is active
  const contrastMode = useAccessibilityStore((state) => state.contrastMode);
  const isHighContrast = contrastMode !== 'default';

  // Get header color for this paragraph type (disabled in high contrast mode)
  const headerColor = isHeader && headerColors && !isHighContrast
    ? headerColors[paragraphType as keyof HeaderColors]
    : undefined;

  // Heat map integration
  const heatValue = useParagraphHeatValue(paragraph.paragraphId);

  // Viewport tracking for viewership heat map
  const { ref: viewportRef } = useViewportTracking({
    paragraphId: paragraph.paragraphId,
    documentId,
    minDuration: 5,
    threshold: 0.5,
    enabled: true,
  });

  // Combine refs for the card element
  const setRefs = useCallback(
    (element: HTMLElement | null) => {
      // Set cardRef
      (cardRef as React.MutableRefObject<HTMLElement | null>).current = element;
      // Set viewportRef
      (viewportRef as React.MutableRefObject<HTMLElement | null>).current = element;
    },
    [viewportRef]
  );

  // Get comment count from store (updates in real-time)
  const storeCommentCount = useUIStore((state: UIState) => state.commentCounts[paragraph.paragraphId]);
  // Use store value if available, otherwise fall back to initial prop
  const commentCount = storeCommentCount !== undefined ? storeCommentCount : initialCommentCount;

  // Get suggestion count from store (updates in real-time)
  const storeSuggestionCount = useUIStore((state: UIState) => state.suggestionCounts[paragraph.paragraphId]);
  // Use store value if available, otherwise fall back to initial prop
  const suggestionCount = storeSuggestionCount !== undefined ? storeSuggestionCount : initialSuggestionCount;

  // Get approval state from store (updates in real-time when user approves/rejects)
  const storeApproval = useUIStore((state: UIState) => state.approvals[paragraph.paragraphId]);

  // Get interaction state from store (updates in real-time when user comments/evaluates)
  const storeHasInteracted = useUIStore((state: UIState) => state.userInteractions.has(paragraph.paragraphId));

  // Use store value if available, otherwise fall back to initial prop
  const isApproved = storeApproval !== undefined ? storeApproval : initialApproval;
  const hasInteracted = storeHasInteracted || initialHasInteracted;

  // Determine approval state for styling
  // Priority: approved/rejected > interacted > pending
  const approvalState = isApproved === undefined
    ? (hasInteracted ? 'interacted' : 'pending')
    : isApproved
      ? 'approved'
      : 'rejected';

  // Handle click outside to collapse on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isExpanded]);

  // Toggle expansion on tap (for mobile)
  // Allow text selection - only toggle if no text is selected
  const handleTap = useCallback(() => {
    const selection = window.getSelection();
    // If user is selecting text (selection has content), don't toggle
    if (selection && selection.toString().trim().length > 0) {
      return;
    }
    setIsExpanded(prev => !prev);
  }, []);

  // Toggle non-interactive mode (admin only)
  const handleToggleNonInteractive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin || isTogglingNonInteractive) return;

    const newValue = !isNonInteractive;
    setIsTogglingNonInteractive(true);

    try {
      const response = await fetch(`/api/admin/paragraphs/${paragraph.paragraphId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          isNonInteractive: newValue,
        }),
      });

      if (response.ok) {
        setIsNonInteractive(newValue);
        onNonInteractiveToggle?.(paragraph.paragraphId, newValue);
      } else {
        logError(new Error('API returned non-ok response'), {
          operation: 'ParagraphCard.toggleNonInteractive',
          paragraphId: paragraph.paragraphId,
          documentId,
        });
      }
    } catch (error) {
      logError(error, {
        operation: 'ParagraphCard.toggleNonInteractive',
        paragraphId: paragraph.paragraphId,
        documentId,
      });
    } finally {
      setIsTogglingNonInteractive(false);
    }
  }, [isAdmin, isTogglingNonInteractive, isNonInteractive, paragraph.paragraphId, documentId, onNonInteractiveToggle]);

  const cardClasses = clsx(
    styles.card,
    styles[`type-${paragraphType}`],
    effectiveNonInteractive ? styles.nonInteractive : styles[approvalState],
    // Normal style override for non-interactive paragraphs (admin setting)
    effectiveNonInteractive && nonInteractiveNormalStyle && styles.nonInteractiveNormal,
    // Legacy heat level prop
    heatLevel && styles[`heat-${heatLevel}`],
    // New heat map integration
    heatValue && styles[`heatmap-${heatValue.type}`],
    heatValue && styles[`heatmap-level-${heatValue.level}`],
    isExpanded && styles.expanded
  );

  // Sanitize content to prevent XSS attacks
  // Memoized to avoid re-sanitizing on every render
  const sanitizedContent = useMemo(
    () => sanitizeHTML(paragraph.content || ''),
    [paragraph.content]
  );

  // Render content based on paragraph type
  // Content may contain HTML formatting tags (bold, italic, etc.)
  // Always render an element (never null) to maintain consistent structure between SSR and client
  const renderContent = () => {
    // Style object for headers with custom color
    const headerStyle = headerColor ? { color: headerColor } : undefined;

    switch (paragraphType) {
      case ParagraphType.h1:
        return (
          <>
            {headingNumber && <span className={styles.headingNumber}>{headingNumber}. </span>}
            <h1 className={styles.content} style={headerStyle} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </>
        );
      case ParagraphType.h2:
        return (
          <>
            {headingNumber && <span className={styles.headingNumber}>{headingNumber}. </span>}
            <h2 className={styles.content} style={headerStyle} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </>
        );
      case ParagraphType.h3:
        return (
          <>
            {headingNumber && <span className={styles.headingNumber}>{headingNumber}. </span>}
            <h3 className={styles.content} style={headerStyle} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </>
        );
      case ParagraphType.h4:
        return (
          <>
            {headingNumber && <span className={styles.headingNumber}>{headingNumber}. </span>}
            <h4 className={styles.content} style={headerStyle} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </>
        );
      case ParagraphType.h5:
        return (
          <>
            {headingNumber && <span className={styles.headingNumber}>{headingNumber}. </span>}
            <h5 className={styles.content} style={headerStyle} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </>
        );
      case ParagraphType.h6:
        return (
          <>
            {headingNumber && <span className={styles.headingNumber}>{headingNumber}. </span>}
            <h6 className={styles.content} style={headerStyle} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </>
        );
      case ParagraphType.li:
        return (
          <div className={styles.listItem}>
            <span className={styles.bullet} aria-hidden="true">•</span>
            <p className={styles.content} dangerouslySetInnerHTML={{ __html: sanitizedContent }} suppressHydrationWarning />
          </div>
        );
      case ParagraphType.table:
        return (
          <div
            className={styles.tableWrapper}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            suppressHydrationWarning
          />
        );
      case ParagraphType.image: {
        const isMissingAlt = !paragraph.imageAlt || paragraph.imageAlt.trim() === '';
        return (
          <figure className={styles.imageWrapper}>
            {paragraph.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={paragraph.imageUrl}
                alt={paragraph.imageAlt || t('Document image')}
                className={styles.image}
                loading="lazy"
              />
            )}
            {paragraph.imageCaption && (
              <figcaption className={styles.imageCaption}>
                {paragraph.imageCaption}
              </figcaption>
            )}
            {/* Warning for missing alt text (admin only) */}
            {isAdmin && isMissingAlt && (
              <div className={styles.altWarning} title={t('Alt text is required for accessibility')}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{t('Missing alt text')}</span>
              </div>
            )}
          </figure>
        );
      }
      default:
        return (
          <p className={styles.content} suppressHydrationWarning>
            {headingNumber && <span className={styles.paragraphNumber}>{headingNumber}. </span>}
            <span dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
          </p>
        );
    }
  };

  return (
    <article
      ref={setRefs}
      id={`paragraph-${paragraph.paragraphId}`}
      className={cardClasses}
      onClick={handleTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap();
        }
      }}
      aria-expanded={isExpanded}
      data-heat-type={heatValue?.type}
      data-heat-level={heatValue?.level}
    >
      {/* Visual indicator for approval state */}
      <div className={styles.stateIndicator} aria-hidden="true" />

      {/* Heat map value badge */}
      {heatValue && (
        <div
          className={styles.heatBadge}
          aria-label={`${heatValue.type}: ${heatValue.displayValue}`}
        >
          {heatValue.displayValue}
        </div>
      )}

      <div className={styles.contentWrapper} suppressHydrationWarning>
        {renderContent()}
      </div>

      {/* Show interaction bar only when paragraph is interactive */}
      {!effectiveNonInteractive && (
        <div className={clsx(
          styles.interactionWrapper,
          enhancedVisibility && styles.alwaysVisible
        )}>
          <InteractionBar
            paragraphId={paragraph.paragraphId}
            documentId={documentId}
            isApproved={isApproved}
            isLoggedIn={isLoggedIn}
            commentCount={commentCount}
            suggestionCount={suggestionCount}
            enableSuggestions={enableSuggestions}
            requireGoogleLogin={requireGoogleLogin}
            isAnonymous={isAnonymous}
          />
        </div>
      )}

      {/* Non-interactive label for regular users (only show if manually marked non-interactive, not just because it's a header) */}
      {isNonInteractive && !isAdmin && (
        <div className={styles.nonInteractiveLabel}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{t('Informational')}</span>
        </div>
      )}

      {/* Admin controls section */}
      {isAdmin && (
        <div className={styles.adminControls}>
          {/* Non-interactive toggle - only show for non-headers, or headers when allowHeaderReactions is true */}
          {(!isHeader || allowHeaderReactions) && (
            <button
              type="button"
              className={clsx(
                styles.adminToggle,
                isNonInteractive && styles.active,
                isTogglingNonInteractive && styles.loading
              )}
              onClick={handleToggleNonInteractive}
              disabled={isTogglingNonInteractive}
              title={isNonInteractive ? t('Enable interactions') : t('Disable interactions')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {isNonInteractive ? (
                  // Eye-off icon (interactions disabled)
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  // Hand/touch icon (interactions enabled)
                  <>
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                  </>
                )}
              </svg>
              <span className={styles.adminToggleText}>
                {isNonInteractive ? t('Info only') : t('Interactive')}
              </span>
            </button>
          )}

          {/* View count badge */}
          {viewCount !== undefined && (
            <div className={styles.adminInfo}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{viewCount}</span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
