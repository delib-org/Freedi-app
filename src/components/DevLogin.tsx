import { signInAnonymously } from 'firebase/auth';
import { auth } from '../controllers/db/config';
import { Capacitor } from '@capacitor/core';

export function DevLogin() {
	// Only show on native platform in development
	if (!Capacitor.isNativePlatform() || import.meta.env.PROD) {
		return null;
	}

	const handleDevLogin = async () => {
		try {
			await signInAnonymously(auth);
			console.info('Logged in anonymously for development');
		} catch (error) {
			console.error('Dev login error:', error);
		}
	};

	return (
		<div style={{ 
			position: 'fixed', 
			bottom: '20px', 
			right: '20px', 
			zIndex: 9999,
			background: '#ff6b6b',
			color: 'white',
			padding: '10px 20px',
			borderRadius: '5px',
			cursor: 'pointer'
		}}>
			<button onClick={handleDevLogin} style={{ 
				background: 'none', 
				border: 'none', 
				color: 'white',
				cursor: 'pointer'
			}}>
				Dev Login (Anonymous)
			</button>
		</div>
	);
}