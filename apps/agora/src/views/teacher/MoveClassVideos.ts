import m from 'mithril';
import { t } from '../../lib/i18n';
import { VideoRow } from './VideoRow';
import {
	VIDEO_GROUP_COLLAPSE_AFTER,
	type LibraryVideoState,
	type StartImpact,
	type VideoGroup,
} from '../../lib/flows/libraryVideo';
import type { AgoraYoutubeVideo } from '@freedi/shared-types';

export interface MoveClassVideosAttrs {
	groups: VideoGroup[];
	now: LibraryVideoState | undefined;
	/** What starting would do to the stage the room is on */
	impact: StartImpact;
	/** The room's current station, named in the confirm */
	stationLabel: string;
	busy: boolean;
	failed: boolean;
	/** Scroll here when the sheet opens from the strip's "switch" */
	focus: boolean;
	onStart: (sceneId: string, video: AgoraYoutubeVideo) => void;
	onClose: () => void;
}

/**
 * The "Videos" group of the move-class sheet. Starting a video IS a class
 * move — everyone goes to the library — so it lives where the teacher already
 * sends the class. One tap, unless it would pull students off a stage they
 * have not finished: then the sheet's own confirm block names them first.
 * The room's stage never changes.
 */
export function MoveClassVideos(): m.Component<MoveClassVideosAttrs> {
	let pending: { sceneId: string; video: AgoraYoutubeVideo } | null = null;
	const expanded = new Set<string>();

	return {
		view({ attrs }) {
			const { groups, now, impact, stationLabel, busy, failed } = attrs;

			const start = (sceneId: string, video: AgoraYoutubeVideo): void => {
				if (impact.interrupts) {
					pending = { sceneId, video };

					return;
				}
				attrs.onStart(sceneId, video);
				attrs.onClose();
			};

			if (pending) {
				const chosen = pending;

				return m(
					'.move-class__confirm',
					{ id: 'move-videos', role: 'group', 'aria-labelledby': 'move-video-confirm-title' },
					[
						m('h3#move-video-confirm-title', t('video.confirm_title')),
						m('ul.move-class__consequences', [
							m(
								'li',
								t('video.confirm_unfinished', { n: impact.unfinished, station: stationLabel }),
							),
						]),
						m('.teacher__mode-row', [
							m(
								'button.btn.btn--primary.move-class__ok',
								{
									type: 'button',
									disabled: busy,
									onclick: () => {
										pending = null;
										attrs.onStart(chosen.sceneId, chosen.video);
										attrs.onClose();
									},
								},
								t('video.confirm_ok'),
							),
							m(
								'button.btn.btn--secondary',
								{
									type: 'button',
									onclick: () => {
										pending = null;
									},
								},
								t('teacher.move.not_yet'),
							),
						]),
					],
				);
			}

			return m(
				'section.move-class__videos',
				{
					id: 'move-videos',
					'aria-label': t('video.group_title'),
					oncreate: (vnode: m.VnodeDOM) => {
						if (attrs.focus) (vnode.dom as HTMLElement).scrollIntoView({ block: 'start' });
					},
				},
				[
					m('h3.move-class__videos-title', t('video.group_title')),
					groups.map((group) => {
						const folded = group.collapsible && !expanded.has(group.sceneId);
						const shown = folded ? group.videos.slice(0, VIDEO_GROUP_COLLAPSE_AFTER) : group.videos;

						return m('.move-class__videos-scene', { key: group.sceneId }, [
							m('p.move-class__videos-scene-title', group.title),
							m(
								'ul.library-videos__list',
								shown.map((video) =>
									m(VideoRow, {
										video,
										n: group.videos.indexOf(video) + 1,
										isNow: now?.sceneId === group.sceneId && now.videoId === video.videoId,
										disabled: busy,
										onStart: () => start(group.sceneId, video),
									}),
								),
							),
							folded
								? m(
										'button.btn.btn--ghost.btn--sm',
										{
											type: 'button',
											onclick: () => {
												expanded.add(group.sceneId);
											},
										},
										t('video.show_all', { n: group.videos.length }),
									)
								: null,
						]);
					}),
					failed ? m('p.youtube-editor__error', { role: 'alert' }, t('video.start_failed')) : null,
				],
			);
		},
	};
}
