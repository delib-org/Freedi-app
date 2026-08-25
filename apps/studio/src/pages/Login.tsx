import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import styles from './Login.module.scss';

export default function Login() {
	const { t } = useTranslation();
	const { signInWithGoogle } = useAuth();
	const [error, setError] = useState('');

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
				<h1 className={styles.title}>WizCol Studio</h1>
				<p className={styles.subtitle}>{t('Create, manage and run your events.')}</p>
				<button type="button" className={styles.button} onClick={handleSignIn}>
					{t('Sign in with Google')}
				</button>
				{error && <p className={styles.error}>{error}</p>}
			</div>
		</main>
	);
}
