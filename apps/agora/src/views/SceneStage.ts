import m from 'mithril';
import { t } from '../lib/i18n';
import { VideoScene } from '../components/VideoScene';
import type { AgoraScene } from '@freedi/shared-types';

export interface SceneStageAttrs {
	/** Ordered scenes of this stage (student-paced) */
	scenes: AgoraScene[];
	/** Persist key so a refresh keeps the student's place */
	storageKey: string;
	/** Rendered on the waiting screen after the last scene (e.g. the needs board) */
	epilogue?: m.Children;
	/** Publishes (scenesDone, scenesTotal) so the teacher sees who finished */
	onProgress?: (scenesDone: number, scenesTotal: number) => void;
}

/**
 * A student-paced sequence of narrative scenes. When the last scene is
 * done, shows a "waiting for the class" state until the teacher advances
 * the session stage.
 */
export function SceneStage(): m.Component<SceneStageAttrs> {
	return {
		view(vnode) {
			const { scenes, storageKey, epilogue, onProgress } = vnode.attrs;
			const index = Number(sessionStorage.getItem(storageKey) ?? '0');
			const done = index >= scenes.length;
			// Report on every render — refresh-safe, and the reporter dedupes
			onProgress?.(Math.min(index, scenes.length), scenes.length);

			if (scenes.length === 0 || done) {
				return m('.shell', [
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[m('.scene__waiting-glow'), m('h3', t('scene.done_waiting')), epilogue ?? null],
					),
				]);
			}

			const scene = scenes[index];

			return m('.shell', [
				m('.shell__content', { style: { justifyContent: 'center' } }, [
					m(VideoScene, {
						scene,
						doneLabel: t('scene.continue'),
						onDone: () => {
							sessionStorage.setItem(storageKey, String(index + 1));
							onProgress?.(Math.min(index + 1, scenes.length), scenes.length);
							m.redraw();
						},
					}),
				]),
			]);
		},
	};
}
