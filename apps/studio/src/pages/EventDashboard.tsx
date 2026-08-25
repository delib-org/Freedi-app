import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { deriveActivities, type DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { db } from '@/firebase';
import { activityUrlResolver } from '@/config';
import ActivityRow from '@/components/ActivityRow';
import ShareHub from '@/components/ShareHub';
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

	const backLink = (label: string) => (
		<Link to="/" className={styles.back}>
			<span className={styles.backArrow} aria-hidden="true">
				←
			</span>
			{label}
		</Link>
	);

	if (loading) return <main className={styles.page}>{t('Loading…')}</main>;

	if (error) {
		return (
			<main className={styles.page}>
				<p className={styles.error}>{error}</p>
				{backLink(t('Back to My Events'))}
			</main>
		);
	}

	return (
		<main className={styles.page}>
			{backLink(t('My Events'))}

			<header className={styles.header}>
				<span className={styles.badge}>{t('Event')}</span>
				<h1 className={styles.title}>{data.event?.statement || t('Untitled event')}</h1>
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
		</main>
	);
}
