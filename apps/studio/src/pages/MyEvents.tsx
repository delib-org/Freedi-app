import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFacilitatorEvents, type FacilitatorEvent } from '@freedi/event-core';
import { useAuth } from '@/auth/AuthContext';
import { db } from '@/firebase';
import styles from './MyEvents.module.css';

export default function MyEvents() {
	const { user } = useAuth();
	const [events, setEvents] = useState<FacilitatorEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!user) return;
		let active = true;
		setLoading(true);
		listFacilitatorEvents(db, user.uid)
			.then((list) => {
				if (active) setEvents(list);
			})
			.catch(() => {
				if (active) setError('Could not load your events.');
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [user]);

	return (
		<main className={styles.page}>
			<div className={styles.header}>
				<h1 className={styles.title}>My Events</h1>
				<button type="button" className={styles.newBtn} disabled title="Coming soon">
					+ New Event
				</button>
			</div>

			{loading && <p className={styles.muted}>Loading your events…</p>}
			{error && <p className={styles.error}>{error}</p>}

			{!loading && !error && events.length === 0 && (
				<p className={styles.muted}>
					You don’t administer any events yet. Events are the top-level groups you manage.
				</p>
			)}

			<ul className={styles.list}>
				{events.map((event) => (
					<li key={event.statementId}>
						<Link to={`/events/${event.statementId}`} className={styles.card}>
							<span className={styles.cardTitle}>{event.title || 'Untitled event'}</span>
							<span className={styles.cardRole}>{event.role}</span>
						</Link>
					</li>
				))}
			</ul>
		</main>
	);
}
