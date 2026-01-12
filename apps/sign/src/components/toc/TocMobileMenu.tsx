'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { TocItem, TextDirection } from '@/types';
import { useScrollSpy, scrollToSection } from '@/hooks/useScrollSpy';
import styles from './TocMobileMenu.module.scss';

interface TocMobileMenuProps {
  items: TocItem[];
  textDirection?: TextDirection;
}

export default function TocMobileMenu({
  items,
  textDirection = 'ltr',
}: TocMobileMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const itemIds = items.map((item) => item.id);
  const activeId = useScrollSpy(itemIds);

  // Get current section index for badge
  const currentIndex = activeId
    ? itemIds.indexOf(activeId) + 1
    : 0;

  // Close menu on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  }, [isOpen]);

  // Close menu when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      isOpen &&
      menuRef.current &&
      !menuRef.current.contains(e.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(e.target as Node)
    ) {
      setIsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    // Prevent body scroll when menu is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown, handleClickOutside, isOpen]);

  if (items.length === 0) {
    return null;
  }

  const handleItemClick = (id: string) => {
    scrollToSection(id);
    setIsOpen(false);
  };

  const handleItemKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(id);
    }
  };

  const isRtl = textDirection === 'rtl';
  const menuPositionClass = isRtl ? styles.menuRight : styles.menuLeft;

  return (
    <>
      {/* Hamburger button */}
      <button
        ref={buttonRef}
        type="button"
        className={styles.hamburgerButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={t('Table of Contents')}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        {currentIndex > 0 && (
          <span className={styles.badge}>{currentIndex}</span>
        )}
      </button>

      {/* Backdrop */}
      <div
        className={`${styles.backdrop} ${isOpen ? styles.backdropVisible : ''}`}
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-out menu */}
      <div
        ref={menuRef}
        className={`${styles.menu} ${menuPositionClass} ${isOpen ? styles.menuOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('Table of Contents')}
        dir={textDirection}
      >
        <div className={styles.menuHeader}>
          <h2 className={styles.menuTitle}>{t('Table of Contents')}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setIsOpen(false)}
            aria-label="Close"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className={styles.menuNav} aria-label={t('Table of Contents')}>
          <ul className={styles.menuList} role="list">
            {items.map((item) => (
              <li
                key={item.id}
                className={`${styles.menuItem} ${styles[`menuItemLevel${item.level}`]}`}
              >
                <button
                  type="button"
                  className={`${styles.menuLink} ${activeId === item.id ? styles.menuLinkActive : ''}`}
                  onClick={() => handleItemClick(item.id)}
                  onKeyDown={(e) => handleItemKeyDown(e, item.id)}
                  aria-current={activeId === item.id ? 'location' : undefined}
                >
                  <span className={styles.menuLinkText} suppressHydrationWarning>{item.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
