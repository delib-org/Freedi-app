import m from 'mithril';
import { t } from '../lib/i18n';
import { VideoScene } from '../components/VideoScene';
import type { AgoraScene } from '@freedi/shared-types';

export interface SceneStageAttrs {
	/** Ordered scenes of this stage (student-paced) */
	scenes: AgoraScene[];
	/** Persist key so a refresh keeps the student's place */
	storageKey: string;
}

/**
 * A student-paced sequence of narrative scenes. When the last scene is
 * done, shows a "waiting for the class" state until the teacher advances
 * the session stage.
 */
export function SceneStage(): m.Component<SceneStageAttrs> {
	return {
		view(vnode) {
			const { scenes, storageKey } = vnode.attrs;
			const index = Number(sessionStorage.getItem(storageKey) ?? '0');
			const done = index >= scenes.length;

			if (scenes.length === 0 || done) {
				return m('.shell', [
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[m('.scene__waiting-glow'), m('h3', t('scene.done_waiting'))],
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
							m.redraw();
						},
					}),
				]),
			]);
		},
	};
}
