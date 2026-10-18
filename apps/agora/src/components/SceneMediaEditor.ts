import m from 'mithril';
import { AGORA_LIMITS, AgoraScene } from '@freedi/shared-types';
import { t } from '../lib/i18n';

export interface SceneMediaEditorAttrs {
	scene: AgoraScene;
	/** Whole percents while a file is going up; undefined when none is */
	imageProgress: number | undefined;
	videoProgress: number | undefined;
	onImage: (file: File) => void;
	onVideo: (file: File) => void;
	onRemoveImage: (url: string) => void;
	/** A file over the limit is refused out loud, not ignored */
	onTooBig: (limitBytes: number) => void;
}

function fileInput(
	accept: string,
	limit: number,
	take: (file: File) => void,
	tooBig: (limitBytes: number) => void,
): m.Children {
	return m('input.editor__file', {
		type: 'file',
		accept,
		onchange: (event: Event) => {
			const target = event.target as HTMLInputElement;
			const file = target.files?.[0];
			if (!file) return;
			if (file.size > limit) {
				tooBig(limit);
				target.value = '';
			} else {
				take(file);
			}
		},
	});
}

/** One scene's pictures and video: add, remove, and the progress of what is going up */
export const SceneMediaEditor: m.Component<SceneMediaEditorAttrs> = {
	view({ attrs }) {
		const { scene, imageProgress, videoProgress } = attrs;

		return [
			m('label.teacher__section-title', t('editor.images')),
			scene.imageUrls.length > 0
				? m(
						'.editor__image-list',
						scene.imageUrls.map((url) =>
							m('.editor__image-item', { key: url }, [
								m('img.editor__image-thumb', { src: url, alt: '' }),
								m(
									'button.btn.btn--ghost.btn--sm',
									{ type: 'button', onclick: () => attrs.onRemoveImage(url) },
									t('editor.remove_image'),
								),
							]),
						),
					)
				: null,
			imageProgress !== undefined
				? m('p.lobby__status', t('editor.image_uploading', { pct: imageProgress }))
				: fileInput('image/*', AGORA_LIMITS.MAX_IMAGE_BYTES, attrs.onImage, attrs.onTooBig),
			m('label.teacher__section-title', t('editor.video')),
			videoProgress !== undefined
				? m('p.lobby__status', t('editor.video_uploading', { pct: videoProgress }))
				: fileInput('video/*', AGORA_LIMITS.MAX_VIDEO_BYTES, attrs.onVideo, attrs.onTooBig),
			scene.videoUrl
				? m('video.scene__video', { src: scene.videoUrl, controls: true, preload: 'metadata' })
				: null,
		];
	},
};
