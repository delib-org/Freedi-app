import React from 'react';
import { NotificationDiagnostics } from '@/view/components/notifications/NotificationDiagnostics';
import { useNotifications } from '@/controllers/hooks/useNotifications';
import { Link } from 'react-router';
import styles from './CheckNotifications.module.scss';

export default function CheckNotifications() {
	// Initialize notifications when on settings page
	useNotifications();

	return (
		<div className={styles.settings}>
			<div className="btns" style={{ marginBottom: '1rem' }}>
				<Link to="/my" className="btn btn--secondary">
					← Back to Profile
				</Link>
			</div>

			<h1>Settings</h1>

			<section>
				<h2>Notifications</h2>
				<NotificationDiagnostics />
			</section>

			{/* Add other settings sections here */}
		</div>
	);
}
