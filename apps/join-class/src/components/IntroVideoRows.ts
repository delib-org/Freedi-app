import m from 'mithril';
import '@/styles/intro-videos.scss';
import { t } from '@/lib/i18n';
import { introVideoEmbed, introVideoLabel, type IntroVideo } from '@/lib/classroom/introVideos';

/**
 * The Opening step's video list (UX 14.C): one row per video, in the teacher's
 * order. Nothing is loaded until the student taps "watch here"; one player is
 * open at a time (opening another closes the first); nothing ever plays by itself.
 */

export interface IntroVideoRowsAttrs {
	videos: readonly IntroVideo[];
	/** The video the projector shows now, or null (the text). */
	liveId: string | null;
	/** Id of the row whose player is open. */
	openId: string | null;
	/** Ids of file videos that failed to load. */
	failedIds: ReadonlySet<string>;
	onOpen: (id: string) => void;
	onFailed: (id: string) => void;
	/** What a failed file video says. Default: the phone's "the teacher is projecting". */
	failedText?: string;
	/**
	 * Teacher console only (UX 15.L): when set, an open row shows a "full screen" button
	 * that hands the row's player frame to this callback. The phone passes nothing, so it
	 * never loads the Fullscreen helper.
	 */
	onFullscreen?: (frame: HTMLElement) => void;
	/** Files on a laptop can preload their metadata; the phone keeps 'none'. */
	preload?: 'none' | 'metadata';
}

function player(
	video: IntroVideo,
	label: string,
	preload: 'none' | 'metadata',
	onFailed: () => void,
): m.Vnode | null {
	const embed = introVideoEmbed(video.url);
	if (!embed) return null;
	const focusAndShow = (vnode: m.VnodeDOM): void => {
		const el = vnode.dom as HTMLElement;
		el.focus();
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		el.closest('.intro-video-row')?.scrollIntoView({
			block: 'nearest',
			behavior: reduce ? 'auto' : 'smooth',
		});
	};
	if (embed.kind === 'youtube') {
		return m('iframe.intro-video-row__player', {
			src: embed.src,
			title: label,
			allow: 'encrypted-media; picture-in-picture; fullscreen',
			referrerpolicy: 'strict-origin-when-cross-origin',
			allowfullscreen: true,
			oncreate: focusAndShow,
		});
	}

	return m('video.intro-video-row__player', {
		src: embed.src,
		controls: true,
		playsinline: true,
		preload,
		tabindex: '-1',
		'aria-label': label,
		oncreate: focusAndShow,
		onerror: () => {
			onFailed();
			m.redraw();
		},
	});
}

function fullscreenButton(attrs: IntroVideoRowsAttrs, id: string, label: string): m.Vnode {
	return m(
		'button.btn.btn--secondary.btn--small.intro-video-row__fullscreen',
		{
			type: 'button',
			'data-video-id': id,
			'aria-label': `${t('projector.fullscreen')}: ${label}`,
			onclick: (event: Event) => {
				const frame = (event.currentTarget as HTMLElement)
					.closest('.intro-video-row')
					?.querySelector<HTMLElement>('.intro-video-row__frame');
				if (frame && attrs.onFullscreen) attrs.onFullscreen(frame);
			},
		},
		t('projector.fullscreen'),
	);
}

function row(attrs: IntroVideoRowsAttrs, video: IntroVideo, index: number): m.Vnode {
	const position = index + 1;
	const label = introVideoLabel(video, position);
	const live = attrs.liveId === video.id;
	const open = attrs.openId === video.id;
	const failed = attrs.failedIds.has(video.id);
	let action: m.Children;
	if (failed) {
		action = m(
			'p.intro-video-row__note',
			{ role: 'status' },
			attrs.failedText ?? t('opening.video_failed'),
		);
	} else if (open) {
		action = m(
			'.intro-video-row__frame',
			player(video, label, attrs.preload ?? 'none', () => attrs.onFailed(video.id)),
		);
	} else {
		action = m(
			'button.btn.btn--secondary.intro-video-row__play',
			{
				type: 'button',
				'aria-describedby': `intro-video-title-${video.id}`,
				onclick: () => attrs.onOpen(video.id),
			},
			[m('span.opening__play-icon', { 'aria-hidden': 'true' }), t('opening.play')],
		);
	}

	return m(
		'li.intro-video-row',
		{
			key: video.id,
			class: `${live ? 'intro-video-row--live' : ''} ${open && !failed ? 'intro-video-row--open' : ''}`,
		},
		[
			m('span.intro-video-row__title', { id: `intro-video-title-${video.id}`, dir: 'auto' }, label),
			live
				? m('span.intro-video-row__live', [
						m('span.intro-video-row__mark', { 'aria-hidden': 'true' }),
						t('opening.on_projector'),
					])
				: null,
			open && !failed && attrs.onFullscreen ? fullscreenButton(attrs, video.id, label) : null,
			m('.intro-video-row__action', action),
		],
	);
}

export const IntroVideoRows: m.Component<IntroVideoRowsAttrs> = {
	view({ attrs }) {
		if (attrs.videos.length === 0) return null;

		return m('section.intro-videos', { 'aria-labelledby': 'intro-videos-title' }, [
			m('h2.intro-videos__title', { id: 'intro-videos-title' }, t('opening.videos')),
			m(
				'ol.intro-videos__list',
				attrs.videos.map((video, index) => row(attrs, video, index)),
			),
		]);
	},
};
