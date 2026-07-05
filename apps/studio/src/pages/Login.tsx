import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import styles from './Login.module.css';

export default function Login() {
	const { signInWithGoogle } = useAuth();
	const [error, setError] = useState('');

	const handleSignIn = async () => {
		try {
			setError('');
			await signInWithGoogle();
		} catch {
			setError('Sign-in failed. Please try again.');
		}
	};

	return (
		<main className={styles.login}>
			<div className={styles.card}>
				<h1 className={styles.title}>WizCol Studio</h1>
				<p className={styles.subtitle}>Create, manage and run your events.</p>
				<button type="button" className={styles.button} onClick={handleSignIn}>
					Sign in with Google
				</button>
				{error && <p className={styles.error}>{error}</p>}
			</div>
		</main>
	);
}
