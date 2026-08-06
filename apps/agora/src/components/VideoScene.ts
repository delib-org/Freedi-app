import m from 'mithril';
import { t } from '../lib/i18n';
import type { AgoraScene } from '@freedi/shared-types';

export interface VideoSceneAttrs {
	scene: AgoraScene;
	/** Called when the student finishes the scene */
	onDone: () => void;
	doneLabel: string;
	/**
	 * Full-bleed presentation: the media fills the screen and the copy floats
	 * on top of it in dark caption chips (the narrative stages). Off by
	 * default so the endings can still sit inside the results page.
	 */
	immersive?: boolean;
	/** Position inside the stage's scene run — drawn as story bars on top */
	progress?: { index: number; total: number };
}

/**
 * One narrative scene: teacher-uploaded video when present, otherwise an
 * illustrated text/dialogue card. Dialogue lines reveal one at a time so
 * students read at their own pace.
 */
export function VideoScene(): m.Component<VideoSceneAttrs> {
	let revealed = 1;
	let lastSceneId = '';
	// Phones only autoplay muted video — sound is one tap away, TikTok-style
	let muted = true;

	return {
		view(vnode) {
			const { scene, onDone, doneLabel, immersive = false, progress } = vnode.attrs;

			if (scene.sceneId !== lastSceneId) {
				lastSceneId = scene.sceneId;
				revealed = 1;
			}

			const hasVideo = Boolean(scene.videoUrl);
			const hasDialogue = scene.dialogue.length > 0;
			const allRevealed = !hasDialogue || revealed >= scene.dialogue.length;
			// When a scene has a video, its first image is the video poster
			// (instant frame + fallback) — the rest render as a gallery below.
			const poster = hasVideo ? scene.imageUrls[0] : undefined;
			const galleryImages = hasVideo ? scene.imageUrls.slice(1) : scene.imageUrls;

			const reveal = () => {
				if (!allRevealed) {
					revealed++;
				}
			};

			const dialogueLines = () =>
				scene.dialogue
					.slice(0, revealed)
					.map((line, index) =>
						m('.scene__line', { key: `${scene.sceneId}-${index}` }, [
							m('.scene__speaker', line.speaker),
							m('p.scene__quote', line.line),
						]),
					);

			if (immersive) {
				// Stills advance with the story: each tap moves to the next image
				// of the scene, and holds on the last one.
				const stillIndex = Math.min(revealed - 1, Math.max(galleryImages.length - 1, 0));
				const backdrop = hasVideo ? undefined : galleryImages[stillIndex];

				return m(
					'.scene.scene--immersive',
					// Tap anywhere to hear the next line — the reveal button below
					// stays for keyboard and screen-reader users.
					{ onclick: reveal },
					[
						m('.scene__media', { 'aria-hidden': 'true' }, [
							hasVideo
								? m('video.scene__video', {
										key: scene.videoUrl,
										src: scene.videoUrl,
										poster,
										autoplay: true,
										loop: true,
										muted,
										controls: false,
										playsinline: true,
										preload: 'auto',
									})
								: backdrop
									? m('img.scene__backdrop', { key: backdrop, src: backdrop, alt: '' })
									: null,
						]),

						m('.scene__scrim', { 'aria-hidden': 'true' }),

						progress
							? m(
									'.scene__bars',
									{ 'aria-hidden': 'true' },
									Array.from({ length: progress.total }, (_unused, index) =>
										m('span.scene__bar', {
											key: index,
											class: index < progress.index ? 'scene__bar--done' : '',
										}),
									),
								)
							: null,

						hasVideo
							? m(
									'button.scene__sound',
									{
										type: 'button',
										'aria-label': muted ? t('scene.sound_on') : t('scene.sound_off'),
										onclick: (event: MouseEvent) => {
											event.stopPropagation();
											muted = !muted;
										},
									},
									muted ? '🔇' : '🔊',
								)
							: null,

						// The title lives outside the scrolling column so a long
						// scene never scrolls away where the student is
						m('h2.scene__title', scene.title),

						m(
							'.scene__caption',
							{
								// A long scene scrolls inside its own column — always
								// keep the newest line in view.
								oncreate: (captionVnode: m.VnodeDOM) => {
									captionVnode.dom.scrollTop = captionVnode.dom.scrollHeight;
								},
								onupdate: (captionVnode: m.VnodeDOM) => {
									captionVnode.dom.scrollTop = captionVnode.dom.scrollHeight;
								},
							},
							[
								scene.text ? m('p.scene__text', scene.text) : null,
								hasDialogue ? m('.scene__dialogue', dialogueLines()) : null,
								// A video scene may carry extra stills — keep them reachable
								hasVideo && galleryImages.length > 0
									? m(
											'.scene__strip',
											galleryImages.map((url) =>
												m('img.scene__thumb', { key: url, src: url, alt: '' }),
											),
										)
									: null,
							],
						),

						m('.scene__actions', [
							!allRevealed
								? m(
										// Keeps .btn--secondary so the e2e runs still find the
										// reveal control; .scene__reveal restyles it as glass.
										'button.btn.btn--secondary.btn--full.scene__reveal',
										{ type: 'button', onclick: reveal },
										t('scene.reveal'),
									)
								: m(
										'button.btn.btn--primary.btn--full.btn--lg',
										{
											type: 'button',
											onclick: (event: MouseEvent) => {
												event.stopPropagation();
												onDone();
											},
										},
										doneLabel,
									),
						]),
					],
				);
			}

			return m('.scene', [
				m('h2.scene__title', scene.title),

				hasVideo
					? m('video.scene__video', {
							src: scene.videoUrl,
							poster,
							autoplay: true,
							controls: true,
							playsinline: true,
							preload: 'auto',
						})
					: null,

				galleryImages.length > 0
					? m(
							'.scene__images',
							galleryImages.map((url) => m('img.scene__image', { src: url, alt: '' })),
						)
					: null,

				scene.text ? m('p.scene__text', scene.text) : null,

				hasDialogue ? m('.scene__dialogue', dialogueLines()) : null,

				m('.scene__actions', [
					!allRevealed
						? m('button.btn.btn--secondary.btn--full', { onclick: reveal }, '···')
						: m('button.btn.btn--primary.btn--full.btn--lg', { onclick: onDone }, doneLabel),
				]),
			]);
		},
	};
}
