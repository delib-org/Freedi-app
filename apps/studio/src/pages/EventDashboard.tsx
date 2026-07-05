import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { deriveActivities, type DerivedActivity } from '@freedi/event-core';
import { db } from '@/firebase';
import { activityUrlResolver } from '@/config';
import ActivityRow from '@/components/ActivityRow';
import ShareHub from '@/components/ShareHub';
import styles from './EventDashboard.module.css';

interface EventData {
	event: Statement | null;
	children: Statement[];
}

export default function EventDashboard() {
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
				if (active) setError('Could not load this event.');
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [eventId]);

	const activities: DerivedActivity[] = useMemo(
		() => deriveActivities(data.children, activityUrlResolver),
		[data.children],
	);

	if (loading) return <main className={styles.page}>Loading…</main>;

	if (error) {
		return (
			<main className={styles.page}>
				<p className={styles.error}>{error}</p>
				<Link to="/" className={styles.back}>
					← Back to My Events
				</Link>
			</main>
		);
	}

	return (
		<main className={styles.page}>
			<Link to="/" className={styles.back}>
				← My Events
			</Link>

			<header className={styles.header}>
				<span className={styles.badge}>Event</span>
				<h1 className={styles.title}>{data.event?.statement || 'Untitled event'}</h1>
				<p className={styles.meta}>Activities: {activities.length}</p>
			</header>

			<div className={styles.layout}>
				<section className={styles.agenda}>
					<h2 className={styles.sectionTitle}>Agenda</h2>
					{activities.length === 0 ? (
						<p className={styles.muted}>
							This event has no activities yet. Add questions or documents to the group.
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
