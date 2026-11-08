import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { deriveActivities, type DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { db } from '@/firebase';
import { activityUrlResolver } from '@/config';
import ActivityRow from '@/components/ActivityRow';
import ShareHub from '@/components/ShareHub';
import StudioPage from './_shared/StudioPage';
import styles from './EventDashboard.module.scss';

interface EventData {
	event: Statement | null;
	children: Statement[];
}

export default function EventDashboard() {
	const { t, tWithParams } = useTranslation();
	const { eventId } = useParams<{ eventId: string }>();
	const [data, setData] = useState<EventData>({ event: null, children: [] });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!eventId) return;
		let active = true;
		setLoading(true);

		const load = async () => {
			const eventSnap = await getDoc(doc(db, Collections.statements, eventId));
			const childrenSnap = await getDocs(
				query(collection(db, Collections.statements), where('parentId', '==', eventId)),
			);
			const children = childrenSnap.docs.map((d) => d.data() as Statement);

			if (active) {
				setData({
					event: eventSnap.exists() ? (eventSnap.data() as Statement) : null,
					children,
				});
			}
		};

		load()
			.catch(() => {
				if (active) setError(t('Could not load this event.'));
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [eventId, t]);

	const activities: DerivedActivity[] = useMemo(
		() => deriveActivities(data.children, activityUrlResolver),
		[data.children],
	);

	// The trail carries the way back now: Personal › Events › this event. A
	// hand-rolled "My Events" link pointed at "/", which redirects a member of
	// one organization INTO that organization rather than back to their events.
	const title = data.event?.statement || t('Untitled event');
	const crumbs = [{ label: t('Events'), to: '/personal' }, { label: title }];

	if (loading) {
		return (
			<StudioPage breadcrumb={crumbs}>
				<div className={styles.page}>{t('Loading…')}</div>
			</StudioPage>
		);
	}

	if (error) {
		return (
			<StudioPage breadcrumb={crumbs}>
				<p className={styles.error}>{error}</p>
			</StudioPage>
		);
	}

	return (
		<StudioPage breadcrumb={crumbs}>
			<header className={styles.header}>
				<span className={styles.badge}>{t('Event')}</span>
				<h1 className={styles.title}>{title}</h1>
				<p className={styles.meta}>
					{tWithParams('Activities: {{count}}', { count: activities.length })}
				</p>
			</header>

			<div className={styles.layout}>
				<section className={styles.agenda}>
					<h2 className={styles.sectionTitle}>{t('Agenda')}</h2>
					{activities.length === 0 ? (
						<p className={styles.muted}>
							{t('This event has no activities yet. Add questions or documents to the group.')}
						</p>
					) : (
						<ol className={styles.list}>
							{activities.map((activity, index) => (
								<ActivityRow key={activity.statementId} activity={activity} index={index} />
							))}
						</ol>
					)}
				</section>

				<ShareHub activities={activities} />
			</div>
		</StudioPage>
	);
}
