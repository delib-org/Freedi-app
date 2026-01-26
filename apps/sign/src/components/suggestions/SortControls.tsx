'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './SortControls.module.scss';

export type SortType = 'consensus' | 'random' | 'newest';

interface SortControlsProps {
  activeSort: SortType;
  onSortChange: (sort: SortType) => void;
  disabled?: boolean;
}

export default function SortControls({
  activeSort,
  onSortChange,
  disabled = false,
}: SortControlsProps) {
  const { t } = useTranslation();

  const sortOptions: { value: SortType; label: string }[] = [
    { value: 'consensus', label: t('Consensus') },
    { value: 'random', label: t('Random') },
    { value: 'newest', label: t('Newest') },
  ];

  return (
    <div
      className={styles.sortControls}
      role="group"
      aria-label={t('Sort suggestions by')}
    >
      {sortOptions.map((option, index) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.sortButton} ${
            activeSort === option.value ? styles.active : ''
          } ${index === 0 ? styles.first : ''} ${
            index === sortOptions.length - 1 ? styles.last : ''
          }`}
          onClick={() => onSortChange(option.value)}
          disabled={disabled}
          aria-pressed={activeSort === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
