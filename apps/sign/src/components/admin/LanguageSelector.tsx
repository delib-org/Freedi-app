'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { LanguagesEnum, LANGUAGE_NAMES, isRTL } from '@freedi/shared-i18n';
import styles from './LanguageSelector.module.scss';

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

interface LanguageSelectorProps {
  selectedLanguage?: string;
  onChange: (language: string) => void;
}

/**
 * Language selector grid for admin settings
 * Allows selecting a default language for the document
 */
export default function LanguageSelector({ selectedLanguage, onChange }: LanguageSelectorProps) {
  const { t } = useTranslation();

  const handleLanguageClick = (language: LanguagesEnum) => {
    // Toggle behavior - if same language is clicked, deselect it (auto mode)
    if (selectedLanguage === language) {
      onChange('');
    } else {
      onChange(language);
    }
  };

  return (
    <div className={styles.languageSelector}>
      <div className={styles.languageGrid}>
        {AVAILABLE_LANGUAGES.map((language) => {
          const isSelected = selectedLanguage === language;
          const languageIsRTL = isRTL(language);

          return (
            <button
              key={language}
              type="button"
              className={`${styles.languageOption} ${isSelected ? styles.selected : ''}`}
              onClick={() => handleLanguageClick(language)}
            >
              <span className={styles.flag}>{FLAG_EMOJIS[language]}</span>
              <span className={styles.name}>{LANGUAGE_NAMES[language]}</span>
              {languageIsRTL && (
                <span className={styles.rtlBadge}>RTL</span>
              )}
              {isSelected && (
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
          );
        })}
      </div>
      {!selectedLanguage && (
        <p className={styles.hint}>
          {t('noLanguageSelectedBrowserPreference') || 'No language selected - will use browser preference'}
        </p>
      )}
    </div>
  );
}
