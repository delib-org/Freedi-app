import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import styles from './AppHeader.module.css';

export default function AppHeader() {
	const { user, signOut } = useAuth();

	return (
		<header className={styles.bar}>
			<Link to="/" className={styles.brand}>
				WizCol <span className={styles.brandAccent}>Studio</span>
			</Link>
			<div className={styles.right}>
				{user?.displayName && <span className={styles.user}>{user.displayName}</span>}
				<button type="button" className={styles.signOut} onClick={() => signOut()}>
					Sign out
				</button>
			</div>
		</header>
	);
}
