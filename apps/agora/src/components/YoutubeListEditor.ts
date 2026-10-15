import m from 'mithril';
import { t } from '../lib/i18n';
import {
	addYoutubeVideo,
	MAX_YOUTUBE_VIDEOS_PER_SCENE,
	moveYoutubeVideo,
	parseYoutubeUrl,
	removeYoutubeVideo,
	youtubeThumbnailUrl,
	type YoutubeParseFailure,
} from '../lib/youtube';
import type { AgoraYoutubeVideo } from '@freedi/shared-types';

export interface YoutubeListEditorAttrs {
	videos: readonly AgoraYoutubeVideo[];
	/** Called with the whole new list after every add, remove or reorder */
	onChange: (videos: AgoraYoutubeVideo[]) => void;
}

const FAILURE_KEYS: Record<YoutubeParseFailure, string> = {
	empty: 'video.err_empty',
	invalid_url: 'video.err_invalid',
	not_youtube: 'video.err_not_youtube',
	no_video_id: 'video.err_no_id',
};

/**
 * The teacher's YouTube list for one scene: paste a link, see a clear message
 * if it is not a YouTube video, then reorder or remove. Stores ids only. The
 * same widget serves the lesson editor; Studio has a React twin that shares
 * the parser's rules.
 */
export function YoutubeListEditor(): m.Component<YoutubeListEditorAttrs> {
	let draft = '';
	let errorText = '';

	return {
		view(vnode) {
			const { videos, onChange } = vnode.attrs;

			const submit = (): void => {
				const parsed = parseYoutubeUrl(draft);
				if (!parsed.ok) {
					errorText = t(FAILURE_KEYS[parsed.reason]);

					return;
				}
				if (videos.some((video) => video.videoId === parsed.video.videoId)) {
					errorText = t('video.err_duplicate');

					return;
				}
				if (videos.length >= MAX_YOUTUBE_VIDEOS_PER_SCENE) {
					errorText = t('video.err_full', { max: MAX_YOUTUBE_VIDEOS_PER_SCENE });

					return;
				}
				errorText = '';
				draft = '';
				onChange(addYoutubeVideo(videos, parsed.video));
			};

			return m('.youtube-editor', [
				videos.length > 0
					? m(
							'ul.youtube-editor__list',
							videos.map((video, index) =>
								m('li.youtube-editor__row', { key: video.videoId }, [
									m('img.youtube-editor__thumb', {
										src: youtubeThumbnailUrl(video.videoId),
										alt: '',
										loading: 'lazy',
									}),
									m(
										'span.youtube-editor__name',
										video.title || t('video.default_title', { n: index + 1 }),
									),
									m(
										'button.btn.btn--ghost.btn--sm',
										{
											type: 'button',
											disabled: index === 0,
											'aria-label': t('video.move_up'),
											onclick: () => onChange(moveYoutubeVideo(videos, video.videoId, -1)),
										},
										'↑',
									),
									m(
										'button.btn.btn--ghost.btn--sm',
										{
											type: 'button',
											disabled: index === videos.length - 1,
											'aria-label': t('video.move_down'),
											onclick: () => onChange(moveYoutubeVideo(videos, video.videoId, 1)),
										},
										'↓',
									),
									m(
										'button.btn.btn--ghost.btn--sm',
										{
											type: 'button',
											onclick: () => onChange(removeYoutubeVideo(videos, video.videoId)),
										},
										t('video.remove'),
									),
								]),
							),
						)
					: null,
				m('.youtube-editor__add', [
					m('input.text-input.youtube-editor__input', {
						type: 'url',
						inputmode: 'url',
						dir: 'ltr',
						value: draft,
						placeholder: t('video.paste_placeholder'),
						'aria-invalid': errorText ? 'true' : 'false',
						oninput: (event: InputEvent) => {
							draft = (event.target as HTMLInputElement).value;
							errorText = '';
						},
						onkeydown: (event: KeyboardEvent) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								submit();
							}
						},
					}),
					m('button.btn.btn--secondary', { type: 'button', onclick: submit }, t('video.add')),
				]),
				errorText ? m('p.youtube-editor__error', { role: 'alert' }, errorText) : null,
			]);
		},
	};
}
