import { Link } from 'react-router-dom';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import styles from './AppHeader.module.scss';

/** Short code shown in the language-pill badge. */
const LANGUAGE_CODES: Partial<Record<LanguagesEnum, string>> = {
	[LanguagesEnum.en]: 'EN',
	[LanguagesEnum.he]: 'עב',
};

export default function AppHeader() {
	const { user, signOut } = useAuth();
	const { t, currentLanguage, changeLanguage } = useTranslation();

	// Minimal EN ⇄ עב toggle until shared-i18n ships a React language picker.
	const nextLanguage = currentLanguage === LanguagesEnum.he ? LanguagesEnum.en : LanguagesEnum.he;

	return (
		<header className={styles.bar}>
			<Link to="/" className={styles.brand}>
				WizCol <span className={styles.brandAccent}>Studio</span>
			</Link>
			<div className={styles.right}>
				{user?.displayName && <span className={styles.user}>{user.displayName}</span>}
				<button
					type="button"
					className="language-pill"
					aria-label={t('Switch language')}
					title={t('Switch language')}
					onClick={() => changeLanguage(nextLanguage)}
				>
					<span className="language-pill__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
							<circle cx="12" cy="12" r="9" />
							<path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
						</svg>
					</span>
					<span className="language-pill__code" aria-hidden="true">
						{LANGUAGE_CODES[currentLanguage] ?? currentLanguage.toUpperCase()}
					</span>
				</button>
				<button type="button" className={styles.signOut} onClick={() => signOut()}>
					{t('Sign out')}
				</button>
			</div>
		</header>
	);
}
