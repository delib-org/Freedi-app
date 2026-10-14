import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraScene, AgoraTopicPackage, AgoraYoutubeVideo } from '@freedi/shared-types';
import { Button, Skeleton } from '@/components/atomic/atoms';
import YoutubeListEditor from '@/components/YoutubeListEditor';
import { getLesson, saveLessonScenes, withSceneVideos } from '@/db/agoraLessons';
import { logError } from '@/utils/logError';
import StudioPage from '../_shared/StudioPage';
import styles from './LessonVideos.module.scss';

/**
 * `/lessons/:topicId` — the YouTube videos of an Agora lesson, scene by scene.
 * The teacher starts one for the class during the lesson; here they only
 * decide which videos each scene holds and in what order.
 */
export default function LessonVideos() {
	const { t } = useTranslation();
	const { topicId } = useParams<{ topicId: string }>();
	const [lesson, setLesson] = useState<AgoraTopicPackage | null>(null);
	const [scenes, setScenes] = useState<AgoraScene[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (!topicId) return;
		let active = true;
		setLoading(true);
		getLesson(topicId)
			.then((loaded) => {
				if (!active) return;
				setLesson(loaded);
				setScenes(loaded?.scenes ?? []);
				if (!loaded) setError(t('Could not find this lesson.'));
			})
			.catch((err) => {
				logError(err, { operation: 'LessonVideos.load', metadata: { topicId } });
				if (active) setError(t('Could not load this lesson.'));
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [topicId, t]);

	const change = (sceneId: string, videos: AgoraYoutubeVideo[]) => {
		setScenes((current) => withSceneVideos(current, sceneId, videos));
		setDirty(true);
		setSaved(false);
	};

	const save = async () => {
		if (!topicId || saving) return;
		setSaving(true);
		setError('');
		try {
			await saveLessonScenes(topicId, scenes);
			setDirty(false);
			setSaved(true);
		} catch (err) {
			logError(err, { operation: 'LessonVideos.save', metadata: { topicId } });
			setError(t('Could not save. Try again.'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<StudioPage
			breadcrumb={[
				{ label: t('Lessons'), to: '/personal' },
				{ label: lesson?.title || t('Lesson videos') },
			]}
			title={t('Lesson videos')}
			actions={
				<Button
					text={saved ? t('Saved') : t('Save')}
					variant="primary"
					size="small"
					disabled={!dirty || saving}
					onClick={save}
				/>
			}
		>
			{loading && <Skeleton variant="card" height="6rem" />}
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{lesson && (
				<div className={styles.scenes}>
					<p className={styles.hint}>
						{t(
							'Add YouTube links to a scene. During the lesson you choose which one the class watches.',
						)}
					</p>
					{scenes.map((scene) => (
						<section key={scene.sceneId} className={`card ${styles.scene}`}>
							<h2 className={styles.sceneTitle}>{scene.title}</h2>
							<YoutubeListEditor
								videos={scene.youtubeVideos ?? []}
								onChange={(videos) => change(scene.sceneId, videos)}
							/>
						</section>
					))}
					<Link to="/personal" className={styles.back}>
						{t('Back')}
					</Link>
				</div>
			)}
		</StudioPage>
	);
}
