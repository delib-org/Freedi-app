'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { LanguagesEnum, LANGUAGE_NAMES } from '@freedi/shared-i18n';
import styles from './Layout.module.scss';

// Flag emoji mapping for languages
const FLAG_EMOJIS: Record<LanguagesEnum, string> = {
  [LanguagesEnum.he]: '\u{1F1EE}\u{1F1F1}', // Israel flag
  [LanguagesEnum.en]: '\u{1F1FA}\u{1F1F8}', // US flag
  [LanguagesEnum.ar]: '\u{1F1F8}\u{1F1E6}', // Saudi Arabia flag
  [LanguagesEnum.de]: '\u{1F1E9}\u{1F1EA}', // Germany flag
  [LanguagesEnum.es]: '\u{1F1EA}\u{1F1F8}', // Spain flag
  [LanguagesEnum.nl]: '\u{1F1F3}\u{1F1F1}', // Netherlands flag
};

// Available languages in order
const AVAILABLE_LANGUAGES = [
  LanguagesEnum.he,
  LanguagesEnum.en,
  LanguagesEnum.ar,
  LanguagesEnum.de,
  LanguagesEnum.es,
  LanguagesEnum.nl,
];

/**
 * Language switcher dropdown for admin interface
 * Allows changing the interface language
 */
export default function LanguageSwitcher() {
  const { currentLanguage, changeLanguage, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLanguageChange = (language: LanguagesEnum) => {
    changeLanguage(language);
    setIsOpen(false);
  };

  return (
    <div className={styles.languageSwitcher} ref={dropdownRef}>
      <button
        className={styles.languageSwitcherButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('languageSettings') || 'Language Settings'}
        aria-expanded={isOpen}
      >
        <span className={styles.currentFlag}>{FLAG_EMOJIS[currentLanguage]}</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.open : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.languageDropdown}>
          {AVAILABLE_LANGUAGES.map((language) => (
            <button
              key={language}
              className={`${styles.languageOption} ${
                currentLanguage === language ? styles.languageOptionActive : ''
              }`}
              onClick={() => handleLanguageChange(language)}
            >
              <span className={styles.optionFlag}>{FLAG_EMOJIS[language]}</span>
              <span className={styles.optionName}>{LANGUAGE_NAMES[language]}</span>
              {currentLanguage === language && (
                <svg
                  className={styles.checkIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
