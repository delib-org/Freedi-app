import m from 'mithril';
import { t } from '../lib/i18n';
import { pickShownVideo, youtubeEmbedUrl, youtubeThumbnailUrl } from '../lib/youtube';
import type { AgoraYoutubeVideo } from '@freedi/shared-types';

export interface ClassVideo {
	videoId: string;
	startSeconds?: number;
	/** When the teacher started it (ms) — a new stamp pulls every device back to the class */
	at: number;
}

export interface YoutubePlayerAttrs {
	videos: readonly AgoraYoutubeVideo[];
	/** The video the teacher started for the class, when it belongs to this scene */
	classVideo?: ClassVideo;
	/** The wall: no shelf, no picking — it just shows what the class is on */
	display?: boolean;
}

/**
 * A scene's YouTube videos on a phone (or the wall). The class's video is
 * the one shown; a student can pick any other from the shelf and replay it on
 * their own device without moving the class. A newer start from the teacher
 * brings everyone back. Nothing loads from YouTube until a video is started —
 * a poster stands in — and every autoplay is muted.
 */
export function YoutubePlayer(): m.Component<YoutubePlayerAttrs> {
	let ownPick: string | undefined;
	let playing = false;
	let seenAt = 0;

	return {
		view(vnode) {
			const { videos, classVideo, display = false } = vnode.attrs;
			if (videos.length === 0) return null;

			if (classVideo && classVideo.at !== seenAt) {
				seenAt = classVideo.at;
				ownPick = undefined;
				playing = true;
			}

			const classVideoStored = classVideo
				? videos.find((video) => video.videoId === classVideo.videoId)
				: undefined;
			const classEntry: AgoraYoutubeVideo | undefined = classVideoStored
				? {
						...classVideoStored,
						startSeconds: classVideo?.startSeconds ?? classVideoStored.startSeconds,
					}
				: undefined;
			const shown = pickShownVideo(videos, classEntry?.videoId, ownPick);
			const shownEntry =
				shown && shown.videoId === classEntry?.videoId && !ownPick ? classEntry : shown;
			if (!shownEntry) return null;
			const current = shownEntry;
			const indexOf = (video: AgoraYoutubeVideo): number =>
				videos.findIndex((candidate) => candidate.videoId === video.videoId) + 1;
			const titleOf = (video: AgoraYoutubeVideo): string =>
				video.title || t('video.default_title', { n: indexOf(video) });

			return m(
				'.youtube',
				{
					// The scene is tap-to-advance; the player must not eat taps meant for it
					onclick: (event: MouseEvent) => event.stopPropagation(),
				},
				[
					m(
						'.youtube__frame',
						playing
							? m('iframe.youtube__iframe', {
									key: `${current.videoId}-${seenAt}-${ownPick ?? 'class'}`,
									src: youtubeEmbedUrl(current, { autoplay: true }),
									title: titleOf(current),
									allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
									allowfullscreen: true,
									referrerpolicy: 'strict-origin-when-cross-origin',
								})
							: m(
									'button.youtube__poster',
									{
										type: 'button',
										'aria-label': `${t('video.play')}: ${titleOf(current)}`,
										onclick: () => {
											playing = true;
										},
									},
									[
										m('img.youtube__poster-img', {
											src: youtubeThumbnailUrl(current.videoId),
											alt: '',
										}),
										m('span.youtube__play', { 'aria-hidden': 'true' }, '▶'),
									],
								),
					),
					!display && videos.length > 1
						? m(
								'.youtube__shelf',
								{ role: 'group', 'aria-label': t('video.shelf') },
								videos.map((video) =>
									m(
										'button.youtube__chip',
										{
											key: video.videoId,
											type: 'button',
											class: video.videoId === current.videoId ? 'youtube__chip--active' : '',
											'aria-pressed': video.videoId === current.videoId ? 'true' : 'false',
											onclick: () => {
												ownPick = video.videoId;
												playing = true;
											},
										},
										[
											m('img.youtube__chip-img', {
												src: youtubeThumbnailUrl(video.videoId),
												alt: '',
												loading: 'lazy',
											}),
											m('span.youtube__chip-name', titleOf(video)),
											classEntry?.videoId === video.videoId
												? m('span.youtube__chip-flag', t('video.class_here'))
												: null,
										],
									),
								),
							)
						: null,
				],
			);
		},
	};
}
