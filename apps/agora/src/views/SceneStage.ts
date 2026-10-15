import m from 'mithril';
import { t } from '../lib/i18n';
import { VideoScene } from '../components/VideoScene';
import type { ClassVideo } from '../components/YoutubePlayer';
import type { AgoraScene } from '@freedi/shared-types';

export interface SceneStageAttrs {
	allowReplay?: boolean;
	/** Ordered scenes of this stage (student-paced) */
	scenes: AgoraScene[];
	/** Persist key so a refresh keeps the student's place */
	storageKey: string;
	/** Rendered on the waiting screen after the last scene (e.g. the needs board) */
	epilogue?: m.Children;
	/** Publishes (scenesDone, scenesTotal) so the teacher sees who finished */
	onProgress?: (scenesDone: number, scenesTotal: number) => void;
	/**
	 * Where to go when the last scene ends, for a session that has nobody to
	 * wait for. A civic square is drop-in: there is no teacher about to advance
	 * the room, so "waiting for the class" would be waiting for nothing.
	 */
	onFinish?: () => void;
	/** The library video the teacher started for the class (with its scene) */
	classVideo?: ClassVideo & { sceneId: string };
	/** Background materials + the private chat about them (library scenes) */
	materials?: { topicPackageId: string; sessionId: string; userId: string };
}

/**
 * A student-paced sequence of narrative scenes. When the last scene is
 * done, shows a "waiting for the class" state until the teacher advances
 * the session stage.
 */
export function SceneStage(): m.Component<SceneStageAttrs> {
	let replayIndex: number | undefined;
	let activeKey = '';
	/** The teacher's start this device has already followed */
	let followedAt = 0;

	return {
		view(vnode) {
			const { scenes, storageKey, epilogue, onProgress, onFinish } = vnode.attrs;
			if (activeKey !== storageKey) {
				activeKey = storageKey;
				replayIndex = undefined;
			}
			// The teacher started a video: follow it to its scene, once per start.
			// Reading it again is replay mode, so the student's own place and the
			// progress the teacher sees are left alone.
			const { classVideo } = vnode.attrs;
			const followKey = `${storageKey}_yt`;
			if (followedAt === 0) followedAt = Number(sessionStorage.getItem(followKey) ?? '0');
			if (classVideo && classVideo.at !== followedAt) {
				const target = scenes.findIndex((candidate) => candidate.sceneId === classVideo.sceneId);
				if (target >= 0) {
					followedAt = classVideo.at;
					sessionStorage.setItem(followKey, String(followedAt));
					replayIndex = target;
				}
			}
			const index = replayIndex ?? Number(sessionStorage.getItem(storageKey) ?? '0');
			const done = index >= scenes.length;
			// Report on every render — refresh-safe, and the reporter dedupes
			if (replayIndex === undefined) onProgress?.(Math.min(index, scenes.length), scenes.length);

			if (scenes.length === 0 || done) {
				// Nobody to wait for: the player walks on themselves. Advancing
				// for them from inside the view would be a write during render,
				// and it would take the choice away at the same time.
				if (onFinish) {
					return m('.shell', [
						m(
							'.shell__content.text-center',
							{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
							[
								m('.scene__waiting-glow'),
								epilogue ?? null,
								m('button.btn.btn--primary', { onclick: onFinish }, t('scene.enter_square')),
							],
						),
					]);
				}

				return m('.shell', [
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[
							m('.scene__waiting-glow'),
							m('h3', t('scene.done_waiting')),
							epilogue ?? null,
							vnode.attrs.allowReplay && scenes.length
								? m(
										'button.btn.btn--secondary',
										{
											onclick: () => {
												replayIndex = 0;
											},
										},
										'קריאה מחדש · מהעמוד הראשון',
									)
								: null,
						],
					),
				]);
			}

			const scene = scenes[index];

			// Narrative scenes take the whole screen — no shell, no page chrome:
			// the picture IS the screen and the copy floats on it.
			return m(VideoScene, {
				scene,
				immersive: true,
				progress: { index: index + 1, total: scenes.length },
				classVideo: classVideo?.sceneId === scene.sceneId ? classVideo : undefined,
				materials: vnode.attrs.materials,
				doneLabel: t('scene.continue'),
				onDone: () => {
					if (replayIndex !== undefined) {
						replayIndex = index + 1;
					} else {
						sessionStorage.setItem(storageKey, String(index + 1));
						onProgress?.(Math.min(index + 1, scenes.length), scenes.length);
					}
					m.redraw();
				},
			});
		},
	};
}
