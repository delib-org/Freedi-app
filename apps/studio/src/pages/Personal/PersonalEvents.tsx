import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listFacilitatorEvents, type FacilitatorEvent } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { db } from '@/firebase';
import { Button, Skeleton } from '@/components/atomic/atoms';
import NewEventModal from '@/components/NewEventModal';
import { logError } from '@/utils/logError';
import styles from './OrgPicker.module.scss';

/**
 * "Personal" section of the org picker — the facilitator's own events
 * (groups they administer outside any organization). Opens the legacy
 * `/events/:id` dashboard.
 */
export default function PersonalEvents() {
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
			.catch((err) => {
				logError(err, { operation: 'PersonalEvents.list', userId: user.uid });
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
		<section className={styles.section} aria-labelledby="personal-events-title">
			<div className={styles.sectionHeader}>
				<h2 id="personal-events-title" className={styles.sectionTitle}>
					{t('Personal')}
				</h2>
				<Button
					text={`+ ${t('New Event')}`}
					variant="secondary"
					size="small"
					onClick={() => setShowModal(true)}
				/>
			</div>

			{loading && <Skeleton variant="card" height="3.5rem" />}
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{!loading && !error && events.length === 0 && (
				<p className={styles.muted}>
					{t('No events yet. Click “+ New Event” to create your first one.')}
				</p>
			)}

			{events.length > 0 && (
				<ul className={styles.list}>
					{events.map((event) => (
						<li key={event.statementId}>
							<Link
								to={`/events/${event.statementId}`}
								className="card card--interactive card--compact"
							>
								<div className="card__header">
									<span className="card__title">{event.title || t('Untitled event')}</span>
									<span className="card__badge">{t(event.role)}</span>
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}

			{showModal && (
				<NewEventModal
					onClose={() => setShowModal(false)}
					onCreated={(eventId) => navigate(`/events/${eventId}`)}
				/>
			)}
		</section>
	);
}
