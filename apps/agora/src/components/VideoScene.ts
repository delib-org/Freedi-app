import m from 'mithril';
import type { AgoraScene } from '@freedi/shared-types';

export interface VideoSceneAttrs {
	scene: AgoraScene;
	/** Called when the student finishes the scene */
	onDone: () => void;
	doneLabel: string;
}

/**
 * One narrative scene: teacher-uploaded video when present, otherwise an
 * illustrated text/dialogue card. Dialogue lines reveal one at a time so
 * students read at their own pace.
 */
export function VideoScene(): m.Component<VideoSceneAttrs> {
	let revealed = 1;
	let lastSceneId = '';

	return {
		view(vnode) {
			const { scene, onDone, doneLabel } = vnode.attrs;

			if (scene.sceneId !== lastSceneId) {
				lastSceneId = scene.sceneId;
				revealed = 1;
			}

			const hasVideo = Boolean(scene.videoUrl);
			const hasDialogue = scene.dialogue.length > 0;
			const allRevealed = !hasDialogue || revealed >= scene.dialogue.length;

			return m('.scene', [
				m('h2.scene__title', scene.title),

				hasVideo
					? m('video.scene__video', {
							src: scene.videoUrl,
							controls: true,
							playsinline: true,
							preload: 'auto',
						})
					: null,

				scene.imageUrls.length > 0
					? m(
							'.scene__images',
							scene.imageUrls.map((url) => m('img.scene__image', { src: url, alt: '' })),
						)
					: null,

				scene.text ? m('p.scene__text', scene.text) : null,

				hasDialogue
					? m(
							'.scene__dialogue',
							scene.dialogue
								.slice(0, revealed)
								.map((line, index) =>
									m('.scene__line', { key: `${scene.sceneId}-${index}` }, [
										m('.scene__speaker', line.speaker),
										m('p.scene__quote', line.line),
									]),
								),
						)
					: null,

				m('.scene__actions', [
					!allRevealed
						? m(
								'button.btn.btn--secondary.btn--full',
								{
									onclick: () => {
										revealed++;
									},
								},
								'···',
							)
						: m('button.btn.btn--primary.btn--full.btn--lg', { onclick: onDone }, doneLabel),
				]),
			]);
		},
	};
}
