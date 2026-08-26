import { useState } from 'react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import styles from './Login.module.scss';

interface LoginProps {
	/** Context line shown above the button (e.g. when arriving from an invite link). */
	message?: string;
}

/** Short code shown in the language pill. */
const LANGUAGE_CODES: Partial<Record<LanguagesEnum, string>> = {
	[LanguagesEnum.en]: 'EN',
	[LanguagesEnum.he]: 'עב',
};

export default function Login({ message }: LoginProps) {
	const { t, currentLanguage, changeLanguage } = useTranslation();
	const { signInWithGoogle } = useAuth();
	const [error, setError] = useState('');

	const nextLanguage = currentLanguage === LanguagesEnum.he ? LanguagesEnum.en : LanguagesEnum.he;

	const handleSignIn = async () => {
		try {
			setError('');
			await signInWithGoogle();
		} catch {
			setError(t('Sign-in failed. Please try again.'));
		}
	};

	return (
		<main className={styles.login}>
			<div className={styles.card}>
				<div className={styles.cardBar}>
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
						<span className="language-pill__code">
							{LANGUAGE_CODES[currentLanguage] ?? currentLanguage.toUpperCase()}
						</span>
					</button>
				</div>
				<h1 className={styles.title}>WizCol Studio</h1>
				<p className={styles.subtitle}>{message ?? t('Create, manage and run your events.')}</p>
				<button type="button" className={styles.button} onClick={handleSignIn}>
					{t('Sign in with Google')}
				</button>
				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
			</div>
		</main>
	);
}
