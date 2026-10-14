import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraTopicPackage } from '@freedi/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { Skeleton } from '@/components/atomic/atoms';
import { listMyLessons } from '@/db/agoraLessons';
import { logError } from '@/utils/logError';
import styles from './Personal.module.scss';

/**
 * The facilitator's Agora lessons. Each opens `/lessons/:id`, where the
 * YouTube videos of its scenes are added, removed and reordered. Hidden
 * entirely when the user has no lessons — most Studio users never will.
 */
export default function PersonalLessons() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const [lessons, setLessons] = useState<AgoraTopicPackage[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!user) return;
		let active = true;
		listMyLessons(user.uid)
			.then((list) => {
				if (active) setLessons(list);
			})
			.catch((err) => {
				logError(err, { operation: 'PersonalLessons.list', userId: user.uid });
				if (active) setError(t('Could not load your lessons.'));
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [user, t]);

	if (!loading && !error && lessons.length === 0) return null;

	return (
		<section className={styles.section} aria-label={t('Lessons')}>
			<h2 className={styles.sectionTitle}>{t('Lessons')}</h2>
			{loading && <Skeleton variant="card" height="3.5rem" />}
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{lessons.length > 0 && (
				<ul className={styles.list}>
					{lessons.map((lesson) => (
						<li key={lesson.topicPackageId}>
							<Link
								to={`/lessons/${lesson.topicPackageId}`}
								className="card card--interactive card--compact"
							>
								<div className="card__header">
									<span className="card__title">{lesson.title}</span>
									<span className="card__badge">{t('YouTube videos')}</span>
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
