'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { ParagraphType } from '@freedi/shared-types';
import styles from './QuickActionBar.module.scss';

export type ContentType = 'paragraph' | 'heading' | 'image';
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface QuickActionBarProps {
  onAddContent: (type: ParagraphType) => void;
  onAddImage: () => void;
  disabled?: boolean;
  isSelectMode?: boolean;
  onToggleSelectMode?: () => void;
  onSelectAll?: () => void;
  allSelected?: boolean;
  selectedCount?: number;
}

/**
 * Quick action bar with buttons for adding different content types
 * Follows modern editor patterns (Notion, Medium)
 */
export default function QuickActionBar({
  onAddContent,
  onAddImage,
  disabled = false,
  isSelectMode = false,
  onToggleSelectMode,
  onSelectAll,
  allSelected = false,
  selectedCount = 0,
}: QuickActionBarProps) {
  const { t } = useTranslation();
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const headingButtonRef = useRef<HTMLButtonElement>(null);

  // Close heading menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        headingMenuRef.current &&
        !headingMenuRef.current.contains(event.target as Node) &&
        headingButtonRef.current &&
        !headingButtonRef.current.contains(event.target as Node)
      ) {
        setShowHeadingMenu(false);
      }
    }

    if (showHeadingMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHeadingMenu]);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowHeadingMenu(false);
      }
    }

    if (showHeadingMenu) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showHeadingMenu]);

  const handleHeadingSelect = useCallback((level: HeadingLevel) => {
    const typeMap: Record<HeadingLevel, ParagraphType> = {
      h1: ParagraphType.h1,
      h2: ParagraphType.h2,
      h3: ParagraphType.h3,
      h4: ParagraphType.h4,
      h5: ParagraphType.h5,
      h6: ParagraphType.h6,
    };
    onAddContent(typeMap[level]);
    setShowHeadingMenu(false);
  }, [onAddContent]);

  const handleParagraphClick = useCallback(() => {
    onAddContent(ParagraphType.paragraph);
  }, [onAddContent]);

  const headingOptions: { level: HeadingLevel; label: string; preview: string }[] = [
    { level: 'h1', label: t('Heading 1'), preview: 'Aa' },
    { level: 'h2', label: t('Heading 2'), preview: 'Aa' },
    { level: 'h3', label: t('Heading 3'), preview: 'Aa' },
    { level: 'h4', label: t('Heading 4'), preview: 'Aa' },
    { level: 'h5', label: t('Heading 5'), preview: 'Aa' },
    { level: 'h6', label: t('Heading 6'), preview: 'Aa' },
  ];

  if (isSelectMode) {
    return (
      <div className={styles.container}>
        <div className={styles.selectModeBar}>
          <button
            type="button"
            className={styles.cancelSelectButton}
            onClick={onToggleSelectMode}
          >
            {t('Cancel')}
          </button>
          <span className={styles.selectModeLabel}>
            {selectedCount > 0
              ? `${selectedCount} ${t('selected')}`
              : t('Select paragraphs')}
          </span>
          <button
            type="button"
            className={styles.actionButton}
            onClick={onSelectAll}
          >
            {allSelected ? t('Deselect All') : t('Select All')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>{t('Add Content')}</span>

      <div className={styles.buttonGroup}>
        {/* Paragraph Button */}
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleParagraphClick}
          disabled={disabled}
          title={t('Add paragraph')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{t('Paragraph')}</span>
        </button>

        {/* Heading Button with Dropdown */}
        <div className={styles.dropdownContainer}>
          <button
            ref={headingButtonRef}
            type="button"
            className={`${styles.actionButton} ${showHeadingMenu ? styles.active : ''}`}
            onClick={() => setShowHeadingMenu(!showHeadingMenu)}
            disabled={disabled}
            title={t('Add heading')}
            aria-expanded={showHeadingMenu}
            aria-haspopup="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <text
                x="12"
                y="16"
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill="currentColor"
                stroke="none"
              >
                H
              </text>
            </svg>
            <span>{t('Heading')}</span>
            <svg
              className={`${styles.chevron} ${showHeadingMenu ? styles.open : ''}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showHeadingMenu && (
            <div ref={headingMenuRef} className={styles.headingMenu} role="menu">
              {headingOptions.map(({ level, label }) => (
                <button
                  key={level}
                  type="button"
                  className={styles.headingOption}
                  onClick={() => handleHeadingSelect(level)}
                  role="menuitem"
                >
                  <span className={`${styles.headingPreview} ${styles[level]}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Image Button */}
        <button
          type="button"
          className={styles.actionButton}
          onClick={onAddImage}
          disabled={disabled}
          title={t('Add image')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>{t('Image')}</span>
        </button>

        {/* List Item Button */}
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => onAddContent(ParagraphType.li)}
          disabled={disabled}
          title={t('Add list item')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1" fill="currentColor" />
            <circle cx="4" cy="12" r="1" fill="currentColor" />
            <circle cx="4" cy="18" r="1" fill="currentColor" />
          </svg>
          <span>{t('List')}</span>
        </button>

        {/* Divider */}
        <span className={styles.divider} />

        {/* Select Mode Button */}
        <button
          type="button"
          className={styles.actionButton}
          onClick={onToggleSelectMode}
          disabled={disabled}
          title={t('Select paragraphs for bulk actions')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>{t('Select')}</span>
        </button>
      </div>
    </div>
  );
}
