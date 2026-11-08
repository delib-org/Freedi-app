import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { t } from '../../lib/i18n';
import { startLibraryVideo } from '../../lib/teacher';
import { VideoRow } from './VideoRow';
import type { AgoraScene, AgoraSession } from '@freedi/shared-types';

export interface LibraryVideosAttrs {
	sessionId: string;
	scene: AgoraScene;
	/** What the class is on now, if the teacher has started anything */
	now: AgoraSession['libraryVideo'];
	/** The highest call stamp already in play, so a start is always read as newer */
	floorAt?: number;
	/** Told the stamp of a start this console wrote, so it does not announce its own call */
	onStarted?: (at: number) => void;
}

/**
 * The library-stage peek's shortcut: the scene's videos, each startable. The
 * move-class sheet holds the same rows for any moment of the lesson.
 */
export function LibraryVideos(): m.Component<LibraryVideosAttrs> {
	let failed = false;
	let busyId = '';

	return {
		view(vnode) {
			const { sessionId, scene, now, floorAt, onStarted } = vnode.attrs;
			const videos = scene.youtubeVideos ?? [];
			if (videos.length === 0) return null;

			return m('.library-videos', [
				m('p.teacher__section-title', t('video.teacher_section')),
				m(
					'ul.library-videos__list',
					videos.map((video, index) =>
						m(VideoRow, {
							video,
							n: index + 1,
							isNow: now?.sceneId === scene.sceneId && now.videoId === video.videoId,
							disabled: busyId !== '',
							onStart: () => {
								busyId = video.videoId;
								failed = false;
								startLibraryVideo(sessionId, scene.sceneId, video, floorAt)
									.then((at) => onStarted?.(at))
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
						}),
					),
				),
				failed ? m('p.youtube-editor__error', { role: 'alert' }, t('video.start_failed')) : null,
			]);
		},
	};
}
