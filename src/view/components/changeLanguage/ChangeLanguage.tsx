import { LanguagesEnum } from '@/context/UserConfigContext';
import styles from './ChangeLanguage.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { LANGUAGES } from '@/constants/Languages';
import { FC } from 'react';
import Button, { ButtonType } from '../buttons/button/Button';
import BackToMenuArrow from '@/assets/icons/backToMenuArrow.svg?react';
import Close from '@/assets/icons/close.svg?react';

interface ChangeLanguageProps {
	background?: boolean;
	setShowModal?: (show: boolean) => void;
	setShowMenu?: (show: boolean) => void;
	sameDirMenu?: boolean;
}

const ChangeLanguage: FC<ChangeLanguageProps> = ({
	sameDirMenu = false,
	background = false,
	setShowModal,
	setShowMenu,
}) => {
	const { t, changeLanguage, currentLanguage } = useTranslation();

	function handleLanguageChange(code: string) {
		const lang = code as LanguagesEnum;

		changeLanguage(lang);

		if (lang === 'he' || lang === 'ar') {
			document.body.style.direction = 'rtl';
		} else {
			document.body.style.direction = 'ltr';
		}
		localStorage.setItem('lang', lang);

		if (setShowModal || setShowMenu) {
			setShowModal(false);
		}
	}

	function goBackToMenu() {
		if (setShowMenu) setShowMenu(true);
		setShowModal(false);
	}

	return (
		<>
			<div className={`${styles.wrapper} ${background ? styles.background : ''}`}>
				{background && (
					<div className={styles.XBtn}>
						<Close onClick={() => setShowModal(false)}></Close>
					</div>
				)}
				{background && (
					<span>
						<BackToMenuArrow
							className={`${styles.backArrow} ${(!sameDirMenu && currentLanguage === 'he') || currentLanguage === 'ar' ? styles.reverse : ''}`}
							onClick={goBackToMenu}
						/>
						<h1 className={styles.title}>{t('Language selection')}</h1>
					</span>
				)}
				{background ? (
					<div className={styles.optionsWrapper}>
						{LANGUAGES.map(({ code, label, icon: Icon }) => (
							<button
								key={code}
								className={`${styles.languageOption} ${currentLanguage === code ? styles.selected : ''}`}
								onClick={code === currentLanguage ? undefined : () => handleLanguageChange(code)}
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
						text="close"
						className={styles.closeBtn}
						buttonType={ButtonType.SECONDARY}
						onClick={() => setShowModal(false)}
					></Button>
				)}
			</div>
			{background && (
				<button className={styles.overlay} onClick={() => setShowModal(false)}></button>
			)}
		</>
	);
};

export default ChangeLanguage;
