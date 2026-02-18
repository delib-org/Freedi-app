import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { LANGUAGES } from '@/constants/Languages';
import styles from './LanguageSelector.module.scss';

interface LanguageSelectorProps {
	currentLanguage: string | undefined;
	onChange: (language: string) => void;
}

const LanguageSelector: FC<LanguageSelectorProps> = ({ currentLanguage, onChange }) => {
	const { t } = useTranslation();

	// Handle click - toggle off if already selected, otherwise select
	const handleLanguageClick = (code: string) => {
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
			<div className={styles.selectorGrid}>
				{LANGUAGES.map(({ code, label, icon: Icon }) => (
					<button
						key={code}
						className={`${styles.optionCard} ${currentLanguage === code ? styles.selected : ''}`}
						onClick={() => handleLanguageClick(code)}
						type="button"
						aria-pressed={currentLanguage === code}
						aria-label={`${t('Select')} ${label}`}
					>
						<div className={styles.cardContent}>
							<Icon className={styles.flagIcon} />
							<span className={styles.languageLabel}>{label}</span>
						</div>

						{currentLanguage === code && (
							<span className={styles.selectedBadge}>{t('Active')}</span>
						)}

						{currentLanguage === code && (
							<div className={styles.selectedIndicator} aria-hidden="true" />
						)}
					</button>
				))}
			</div>
		</div>
	);
};

export default LanguageSelector;
