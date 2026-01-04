'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { TocItem, TextDirection } from '@/types';
import { useScrollSpy, scrollToSection } from '@/hooks/useScrollSpy';
import styles from './TableOfContents.module.scss';

interface TableOfContentsProps {
  items: TocItem[];
  textDirection?: TextDirection;
}

export default function TableOfContents({
  items,
  textDirection = 'ltr',
}: TableOfContentsProps) {
  const { t } = useTranslation();
  const itemIds = items.map((item) => item.id);
  const activeId = useScrollSpy(itemIds);

  if (items.length === 0) {
    return null;
  }

  const handleItemClick = (id: string) => {
    scrollToSection(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(id);
    }
  };

  // Determine sidebar position based on text direction
  const isRtl = textDirection === 'rtl';
  const sidebarClass = isRtl ? styles.tocSidebarRight : styles.tocSidebarLeft;

  return (
    <nav
      className={`${styles.tocSidebar} ${sidebarClass}`}
      aria-label={t('Table of Contents')}
      dir={textDirection}
    >
      <h2 className={styles.tocTitle}>{t('Table of Contents')}</h2>
      <ul className={styles.tocList} role="list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`${styles.tocItem} ${styles[`tocItemLevel${item.level}`]}`}
          >
            <button
              type="button"
              className={`${styles.tocLink} ${activeId === item.id ? styles.tocLinkActive : ''}`}
              onClick={() => handleItemClick(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              aria-current={activeId === item.id ? 'location' : undefined}
            >
              <span className={styles.tocLinkText}>{item.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
