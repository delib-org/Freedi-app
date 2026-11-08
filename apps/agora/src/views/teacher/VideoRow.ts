import m from 'mithril';
import { t } from '../../lib/i18n';
import { youtubeThumbnailUrl } from '../../lib/youtube';
import type { AgoraYoutubeVideo } from '@freedi/shared-types';

export interface VideoRowAttrs {
	video: AgoraYoutubeVideo;
	/** 1-based position inside its scene — the fallback name */
	n: number;
	/** The class is watching this one right now */
	isNow: boolean;
	disabled: boolean;
	onStart: () => void;
}

/**
 * One video as a row: picture, name, and "Start for the class" (or "On for
 * the class now"). Shared by the library peek and the move-class sheet, so
 * both draw — and press — the same thing.
 */
export function VideoRow(): m.Component<VideoRowAttrs> {
	return {
		view({ attrs }) {
			const { video, n, isNow, disabled, onStart } = attrs;

			return m(
				'li.library-videos__row',
				{ key: video.videoId, class: isNow ? 'library-videos__row--now' : '' },
				[
					m('img.library-videos__thumb', {
						src: youtubeThumbnailUrl(video.videoId),
						alt: '',
						loading: 'lazy',
					}),
					m('span.library-videos__name', video.title || t('video.default_title', { n })),
					isNow
						? m('span.library-videos__now', t('video.on_for_class'))
						: m(
								'button.btn.btn--secondary.btn--sm.library-videos__start',
								{ type: 'button', disabled, onclick: onStart },
								['▶ ', t('video.start_for_class')],
							),
				],
			);
		},
	};
}
