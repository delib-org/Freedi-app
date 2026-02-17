'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './EmptyState.module.scss';

type EmptyStateVariant = 'noDocuments' | 'noResults' | 'emptyCreated' | 'emptyCollaborating' | 'emptySigned';

interface EmptyStateProps {
  variant: EmptyStateVariant;
  onAction?: () => void;
  onClearSearch?: () => void;
}

export default function EmptyState({ variant, onAction, onClearSearch }: EmptyStateProps) {
  const { t } = useTranslation();

  const config = getConfig(variant, t);

  return (
    <div className={styles.emptyState}>
      <div className={styles.icon} aria-hidden="true">{config.icon}</div>
      <h2 className={styles.title}>{config.title}</h2>
      <p className={styles.message}>{config.message}</p>
      {variant === 'noDocuments' && onAction && (
        <button className={styles.action} onClick={onAction} type="button">
          {t('Create Document')}
        </button>
      )}
      {variant === 'noResults' && onClearSearch && (
        <button className={styles.action} onClick={onClearSearch} type="button">
          {t('Clear search')}
        </button>
      )}
    </div>
  );
}

function getConfig(
  variant: EmptyStateVariant,
  t: (key: string) => string
): { icon: string; title: string; message: string } {
  switch (variant) {
    case 'noDocuments':
      return {
        icon: '\u{1F4C4}',
        title: t('Welcome to WizCol Sign'),
        message: t('Create your first document to get started'),
      };
    case 'noResults':
      return {
        icon: '\u{1F50D}',
        title: t('No results found'),
        message: t('No documents match your search'),
      };
    case 'emptyCreated':
      return {
        icon: '\u{270F}\u{FE0F}',
        title: t('No documents created'),
        message: t('Documents you create will appear here'),
      };
    case 'emptyCollaborating':
      return {
        icon: '\u{1F91D}',
        title: t('No collaborations'),
        message: t('Documents you collaborate on will appear here'),
      };
    case 'emptySigned':
      return {
        icon: '\u{2705}',
        title: t('No signed documents'),
        message: t('Documents you sign will appear here'),
      };
  }
}
