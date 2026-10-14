import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { t } from '../../lib/i18n';
import { startLibraryVideo } from '../../lib/teacher';
import { youtubeThumbnailUrl } from '../../lib/youtube';
import type { AgoraScene, AgoraSession } from '@freedi/shared-types';

export interface LibraryVideosAttrs {
	sessionId: string;
	scene: AgoraScene;
	/** What the class is on now, if the teacher has started anything */
	now: AgoraSession['libraryVideo'];
}

/**
 * The teacher's side of a scene's YouTube videos: pick which one is "now" and
 * start it. Students' phones follow the start; the wall shows it muted.
 */
export function LibraryVideos(): m.Component<LibraryVideosAttrs> {
	let failed = false;
	let busyId = '';

	return {
		view(vnode) {
			const { sessionId, scene, now } = vnode.attrs;
			const videos = scene.youtubeVideos ?? [];
			if (videos.length === 0) return null;

			return m('.library-videos', [
				m('p.teacher__section-title', t('video.teacher_section')),
				m(
					'ul.library-videos__list',
					videos.map((video, index) => {
						const isNow = now?.sceneId === scene.sceneId && now.videoId === video.videoId;

						return m(
							'li.library-videos__row',
							{ key: video.videoId, class: isNow ? 'library-videos__row--now' : '' },
							[
								m('img.library-videos__thumb', {
									src: youtubeThumbnailUrl(video.videoId),
									alt: '',
									loading: 'lazy',
								}),
								m(
									'span.library-videos__name',
									video.title || t('video.default_title', { n: index + 1 }),
								),
								isNow
									? m('span.library-videos__now', t('video.on_for_class'))
									: m(
											'button.btn.btn--secondary.btn--sm',
											{
												type: 'button',
												disabled: busyId !== '',
												onclick: () => {
													busyId = video.videoId;
													failed = false;
													startLibraryVideo(sessionId, scene.sceneId, video, now?.at)
														.catch((error: unknown) => {
															failed = true;
															logError(error instanceof Error ? error : new Error(String(error)), {
																operation: 'libraryVideos.start',
																metadata: { sessionId, sceneId: scene.sceneId },
															});
														})
														.finally(() => {
															busyId = '';
															m.redraw();
														});
												},
											},
											t('video.start_for_class'),
										),
							],
						);
					}),
				),
				failed ? m('p.youtube-editor__error', { role: 'alert' }, t('video.start_failed')) : null,
			]);
		},
	};
}
