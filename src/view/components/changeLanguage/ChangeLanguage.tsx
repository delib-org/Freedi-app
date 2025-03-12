import { LanguagesEnum } from '@/context/UserConfigContext';
import styles from './ChangeLanguage.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { LANGUAGES } from '@/constants/Languages';
import React, { FC } from 'react';

interface ChangeLanguageProps {
	background?: boolean;
	setShowModal?: (show: boolean) => void;
}

const ChangeLanguage: FC<ChangeLanguageProps> = ({
	background = false,
	setShowModal,
}) => {
	const { t, changeLanguage, currentLanguage } = useUserConfig();

	function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const lang = e.target.value as LanguagesEnum;

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
			{background ? (
				<h1 className={styles.title}>{t('Set language')}</h1>
			) : (
				''
			)}
			<select
				className={styles.language}
				defaultValue={currentLanguage || 'he'}
				onChange={handleLanguageChange}
			>
				{LANGUAGES.map(({ code, label }) => (
					<option key={code} value={code}>
						{label}
					</option>
				))}
			</select>
		</div>
	);
};

export default ChangeLanguage;
