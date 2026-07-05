import { FC, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useEventAuthorization } from '@/controllers/hooks/useEventAuthorization';
import { deriveActivities } from '@/controllers/events/deriveActivities';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import ActivityRow from './components/ActivityRow';
import ShareHub from './components/ShareHub';
import styles from './EventDashboard.module.scss';

/**
 * Event Control Center — read-only Event dashboard (Phase 1).
 *
 * Presents any existing top-parent `group` Statement as a single "Event": one
 * screen listing all its child activities (Crowd Consensus, Document, Question…)
 * with deep-links, run-state pills, and a Share Hub. Purely additive — no new
 * writes, no migration. The event id IS the anchor group's statementId.
 */
const EventDashboard: FC = () => {
	const { statementId: eventId } = useParams();
	const { t } = useTranslation();
	const { canManage, loading, denied } = useEventAuthorization(eventId);

	const event = useSelector(statementSelector(eventId));
	const selectChildren = useMemo(() => statementSubsSelector(eventId), [eventId]);
	const children = useSelector(selectChildren);

	// Load the anchor group's direct children (the activities). The group itself
	// is fetched + authorized by ProtectedLayout; here we hydrate its children.
	useEffect(() => {
		if (!eventId || !canManage) return;
		const unsubscribe = listenToSubStatements(eventId);

		return () => unsubscribe();
	}, [eventId, canManage]);

	const activities = useMemo(() => deriveActivities(children ?? []), [children]);

	if (loading) {
		return <LoadingPage />;
	}

	if (denied) {
		return (
			<main className={styles.dashboard}>
				<div className={styles.denied}>
					<h1>{t('Facilitators only')}</h1>
					<p>{t('You need to be an admin of this group to manage its event.')}</p>
					<Link to={eventId ? `/statement/${eventId}` : '/home'} className={styles.denied__link}>
						{t('Back')}
					</Link>
				</div>
			</main>
		);
	}

	return (
		<main className={styles.dashboard}>
			<header className={styles.header}>
				<span className={styles.header__badge}>{t('Event')}</span>
				<h1 className={styles.header__title}>{event?.statement || t('Untitled event')}</h1>
				<p className={styles.header__meta}>
					{t('Activities')}: {activities.length}
				</p>
			</header>

			<div className={styles.layout}>
				<section className={styles.agenda}>
					<h2 className={styles.agenda__title}>{t('Agenda')}</h2>
					{activities.length === 0 ? (
						<p className={styles.agenda__empty}>
							{t('This event has no activities yet. Add questions or documents to the group.')}
						</p>
					) : (
						<ol className={styles.agenda__list}>
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
};

export default EventDashboard;
