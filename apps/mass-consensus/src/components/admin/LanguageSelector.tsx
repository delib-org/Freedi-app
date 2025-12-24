'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { LanguagesEnum, LANGUAGE_NAMES, isRTL } from '@freedi/shared-i18n';
import styles from './Admin.module.scss';

interface LanguageSelectorProps {
  currentLanguage: string | undefined;
  onChange: (language: string) => void;
}

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
 * Language selector component for MC admin
 * Allows selecting a default language for surveys
 * Clicking a selected language toggles it off (removes default)
 */
export default function LanguageSelector({
  currentLanguage,
  onChange,
}: LanguageSelectorProps) {
  const { t } = useTranslation();

  const handleLanguageClick = (code: LanguagesEnum) => {
    if (currentLanguage === code) {
      // Toggle off - remove the default language
      onChange('');
    } else {
      // Select the new language
      onChange(code);
    }
  };

  return (
    <div className={styles.languageSelector}>
      <div className={styles.languageGrid}>
        {AVAILABLE_LANGUAGES.map((code) => {
          const isSelected = currentLanguage === code;
          const isRtl = isRTL(code);

          return (
            <button
              key={code}
              className={`${styles.languageCard} ${isSelected ? styles.languageCardSelected : ''}`}
              onClick={() => handleLanguageClick(code)}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${t('Select')} ${LANGUAGE_NAMES[code]}`}
            >
              <span className={styles.languageFlag}>{FLAG_EMOJIS[code]}</span>
              <span className={styles.languageName}>{LANGUAGE_NAMES[code]}</span>
              {isRtl && (
                <span className={styles.rtlBadge}>RTL</span>
              )}
              {isSelected && (
                <span className={styles.selectedBadge}>{t('Active')}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
