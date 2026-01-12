'use client';

import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { useHeatMapControls } from '@/hooks/useHeatMap';
import { HeatMapType } from '@/types/heatMap';
import styles from './HeatMapToolbar.module.scss';

interface HeatMapToolbarProps {
  className?: string;
}

interface HeatMapOption {
  type: HeatMapType;
  label: string;
  icon: React.ReactNode;
  colorClass: string;
}

const HEAT_MAP_OPTIONS: HeatMapOption[] = [
  {
    type: 'approval',
    label: 'Approval',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    ),
    colorClass: 'approval',
  },
  {
    type: 'comments',
    label: 'Comments',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    colorClass: 'comments',
  },
  {
    type: 'suggestions',
    label: 'Suggestions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    colorClass: 'suggestions',
  },
  {
    type: 'rating',
    label: 'Rating',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    colorClass: 'rating',
  },
  {
    type: 'viewership',
    label: 'Views',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    colorClass: 'viewership',
  },
];

export default function HeatMapToolbar({ className }: HeatMapToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentType, isEnabled, selectType, disable, isLoading } = useHeatMapControls();

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleSelectType = useCallback(
    (type: HeatMapType) => {
      selectType(type);
      // Keep expanded for a moment so user sees the selection
    },
    [selectType]
  );

  const handleDisable = useCallback(() => {
    disable();
    setIsExpanded(false);
  }, [disable]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, action: () => void) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        action();
      }
    },
    []
  );

  const currentOption = HEAT_MAP_OPTIONS.find((opt) => opt.type === currentType);

  return (
    <div className={clsx(styles.toolbar, isExpanded && styles.expanded, className)}>
      {/* Main toggle button */}
      <button
        type="button"
        className={clsx(
          styles.toggleButton,
          isEnabled && styles.active,
          isEnabled && currentOption && styles[currentOption.colorClass]
        )}
        onClick={handleToggleExpand}
        onKeyDown={(e) => handleKeyDown(e, handleToggleExpand)}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Close heat map menu' : 'Open heat map menu'}
        aria-haspopup="menu"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : isEnabled && currentOption ? (
          currentOption.icon
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        )}
      </button>

      {/* Expanded options */}
      {isExpanded && (
        <div
          className={styles.options}
          role="menu"
          aria-label="Heat map options"
        >
          <div className={styles.menuHeader}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Heat Maps</span>
          </div>
          <div className={styles.menuDivider} />
          {HEAT_MAP_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="menuitemradio"
              className={clsx(
                styles.optionButton,
                styles[option.colorClass],
                currentType === option.type && styles.selected
              )}
              onClick={() => handleSelectType(option.type)}
              onKeyDown={(e) => handleKeyDown(e, () => handleSelectType(option.type))}
              aria-checked={currentType === option.type}
              title={option.label}
            >
              {option.icon}
              <span className={styles.optionLabel}>{option.label}</span>
            </button>
          ))}

          {/* Off button */}
          <button
            type="button"
            role="menuitemradio"
            className={clsx(styles.optionButton, styles.off, !isEnabled && styles.selected)}
            onClick={handleDisable}
            onKeyDown={(e) => handleKeyDown(e, handleDisable)}
            aria-checked={!isEnabled}
            title="Turn off"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span className={styles.optionLabel}>Off</span>
          </button>
        </div>
      )}
    </div>
  );
}
