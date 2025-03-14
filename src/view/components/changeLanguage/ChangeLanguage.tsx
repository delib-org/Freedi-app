import { LanguagesEnum } from '@/context/UserConfigContext';
import styles from './ChangeLanguage.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { LANGUAGES } from '@/constants/Languages';
import { FC } from 'react';
import Button, { ButtonType } from '../buttons/button/Button';

interface ChangeLanguageProps {
	background?: boolean;
	setShowModal?: (show: boolean) => void;
}

const ChangeLanguage: FC<ChangeLanguageProps> = ({
	background = false,
	setShowModal,
}) => {
	const { t, changeLanguage, currentLanguage } = useUserConfig();

	function handleLanguageChange(code: string) {
		const lang = code as LanguagesEnum;

		changeLanguage(lang);

		if (lang === 'he' || lang === 'ar') {
			document.body.style.direction = 'rtl';
		} else {
			document.body.style.direction = 'ltr';
		}
		localStorage.setItem('lang', lang);

		if (setShowModal) {
			setShowModal(false);
		}
	}

	return (
		<div
			className={`${styles.wrapper} ${background ? styles.background : ''}`}
		>
			{background && (
				<button
					onClick={() => setShowModal(false)}
					className={styles.XBtn}
				>
					X
				</button>
			)}
			{background && (
				<h1 className={styles.title}>{t('Language selection')}</h1>
			)}
			{background ? (
				<div className={styles.optionsWrapper}>
					{LANGUAGES.map(({ code, label, icon: Icon }) => (
						<button
							key={code}
							className={`${styles.languageOption} ${currentLanguage === code ? styles.selected : ''}`}
							onClick={() => handleLanguageChange(code)}
						>
							<Icon className={styles.flag} />
							<span>{t(label)}</span>
						</button>
					))}
				</div>
			) : (
				<select
					value={currentLanguage}
					onChange={(e) => handleLanguageChange(e.target.value)}
					className={styles.language}
				>
					{LANGUAGES.map(({ code, label }) => (
						<option key={code} value={code}>
							{label}
						</option>
					))}
				</select>
			)}

			{background && (
				<Button
					text='close'
					className={styles.closeBtn}
					buttonType={ButtonType.PRIMARY}
					onClick={() => setShowModal(false)}
				></Button>
			)}
		</div>
	);
};

export default ChangeLanguage;
