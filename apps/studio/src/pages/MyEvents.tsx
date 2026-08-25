import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listFacilitatorEvents, type FacilitatorEvent } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { db } from '@/firebase';
import NewEventModal from '@/components/NewEventModal';
import styles from './MyEvents.module.scss';

export default function MyEvents() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const navigate = useNavigate();
	const [events, setEvents] = useState<FacilitatorEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [showModal, setShowModal] = useState(false);

	useEffect(() => {
		if (!user) return;
		let active = true;
		setLoading(true);
		listFacilitatorEvents(db, user.uid)
			.then((list) => {
				if (active) setEvents(list);
			})
			.catch(() => {
				if (active) setError(t('Could not load your events.'));
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [user, t]);

	return (
		<main className={styles.page}>
			<div className={styles.header}>
				<h1 className={styles.title}>{t('My Events')}</h1>
				<button type="button" className={styles.newBtn} onClick={() => setShowModal(true)}>
					+ {t('New Event')}
				</button>
			</div>

			{loading && <p className={styles.muted}>{t('Loading your events…')}</p>}
			{error && <p className={styles.error}>{error}</p>}

			{!loading && !error && events.length === 0 && (
				<p className={styles.muted}>
					{t('No events yet. Click “+ New Event” to create your first one.')}
				</p>
			)}

			<ul className={styles.list}>
				{events.map((event) => (
					<li key={event.statementId}>
						<Link to={`/events/${event.statementId}`} className={styles.card}>
							<span className={styles.cardTitle}>{event.title || t('Untitled event')}</span>
							<span className={styles.cardRole}>{t(event.role)}</span>
						</Link>
					</li>
				))}
			</ul>

			{showModal && (
				<NewEventModal
					onClose={() => setShowModal(false)}
					onCreated={(eventId) => navigate(`/events/${eventId}`)}
				/>
			)}
		</main>
	);
}
