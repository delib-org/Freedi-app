import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import {
	addYoutubeVideo,
	MAX_YOUTUBE_VIDEOS_PER_SCENE,
	moveYoutubeVideo,
	parseYoutubeUrl,
	removeYoutubeVideo,
	youtubeThumbnailUrl,
	type YoutubeParseFailure,
} from '@freedi/shared-utils';
import type { AgoraYoutubeVideo } from '@freedi/shared-types';
import { Button } from '@/components/atomic/atoms';
import styles from './YoutubeListEditor.module.scss';

interface YoutubeListEditorProps {
	videos: readonly AgoraYoutubeVideo[];
	/** Called with the whole new list after every add, remove or reorder */
	onChange: (videos: AgoraYoutubeVideo[]) => void;
}

/**
 * Paste YouTube links, see a plain message when one is not a YouTube video,
 * reorder and remove. Only the video id is stored. Parsing rules are shared
 * with the Agora lesson editor.
 */
export default function YoutubeListEditor({ videos, onChange }: YoutubeListEditorProps) {
	const { t, tWithParams } = useTranslation();
	const [draft, setDraft] = useState('');
	const [error, setError] = useState('');

	const failureText = (reason: YoutubeParseFailure): string => {
		switch (reason) {
			case 'empty':
				return t('Paste a link first.');
			case 'not_youtube':
				return t('That is not a YouTube link. Paste one that starts with youtube.com or youtu.be.');
			case 'no_video_id':
				return t('We could not find a video in that link. Paste the link of the video itself.');
			default:
				return t('That is not a valid link.');
		}
	};

	const submit = () => {
		const parsed = parseYoutubeUrl(draft);
		if (!parsed.ok) {
			setError(failureText(parsed.reason));

			return;
		}
		if (videos.some((video) => video.videoId === parsed.video.videoId)) {
			setError(t('That video is already on the list.'));

			return;
		}
		if (videos.length >= MAX_YOUTUBE_VIDEOS_PER_SCENE) {
			setError(
				tWithParams('A scene can hold up to {{max}} videos.', {
					max: MAX_YOUTUBE_VIDEOS_PER_SCENE,
				}),
			);

			return;
		}
		setError('');
		setDraft('');
		onChange(addYoutubeVideo(videos, parsed.video));
	};

	return (
		<div className={styles.editor}>
			{videos.length > 0 && (
				<ul className={styles.list}>
					{videos.map((video, index) => (
						<li key={video.videoId} className={styles.row}>
							<img
								className={styles.thumb}
								src={youtubeThumbnailUrl(video.videoId)}
								alt=""
								loading="lazy"
							/>
							<span className={styles.name}>
								{video.title || tWithParams('Video {{n}}', { n: index + 1 })}
							</span>
							<Button
								text="↑"
								variant="secondary"
								size="small"
								disabled={index === 0}
								ariaLabel={t('Move up')}
								onClick={() => onChange(moveYoutubeVideo(videos, video.videoId, -1))}
							/>
							<Button
								text="↓"
								variant="secondary"
								size="small"
								disabled={index === videos.length - 1}
								ariaLabel={t('Move down')}
								onClick={() => onChange(moveYoutubeVideo(videos, video.videoId, 1))}
							/>
							<Button
								text={t('Remove')}
								variant="secondary"
								size="small"
								onClick={() => onChange(removeYoutubeVideo(videos, video.videoId))}
							/>
						</li>
					))}
				</ul>
			)}
			<div className={styles.add}>
				<input
					className={styles.input}
					type="url"
					inputMode="url"
					dir="ltr"
					value={draft}
					placeholder={t('Paste a YouTube link')}
					aria-label={t('Paste a YouTube link')}
					aria-invalid={error ? 'true' : 'false'}
					onChange={(event) => {
						setDraft(event.target.value);
						setError('');
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							submit();
						}
					}}
				/>
				<Button text={t('Add')} variant="secondary" size="small" onClick={submit} />
			</div>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
