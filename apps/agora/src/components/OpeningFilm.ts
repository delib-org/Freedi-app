import m from 'mithril';
import { t } from '../lib/i18n';
import { logError } from '@freedi/shared-utils';
import {
	FILM_ERROR_HOLD_MS,
	FILM_FAILSAFE_MS,
	filmSkippable,
	filmStart,
	skipCountdown,
	type OpeningFilm as Film,
} from '../lib/flows/openingFilm';

export interface OpeningFilmAttrs {
	film: Film;
	/** The projector: plays with sound. A phone starts muted and offers one tap for sound. */
	wall: boolean;
	/** The film ended, was skipped, or could not play: the village appears */
	onDone: () => void;
}

const TICK_MS = 250;
/** Videos fetched ahead of time, so the travel card opens on a playing frame */
const warmed = new Set<string>();

/** Start loading the film while the class waits in the lobby */
export function prefetchFilm(url: string): void {
	if (warmed.has(url)) return;
	warmed.add(url);
	try {
		const probe = document.createElement('video');
		probe.preload = 'auto';
		probe.muted = true;
		probe.src = url;
	} catch (error) {
		logError(error, { operation: 'openingFilm.prefetch', metadata: { url } });
	}
}

/**
 * The scenario's opening film, full screen, on the travel card. Autoplay is
 * never assumed: a refused play() shows a tap-to-play button, and a muted
 * phone shows a tap-for-sound button. After five seconds anyone may skip.
 */
export function OpeningFilm(): m.Component<OpeningFilmAttrs> {
	let video: HTMLVideoElement | null = null;
	let startedAt = 0;
	let muted = true;
	let blocked = false;
	let failed = false;
	let finished = false;
	let tick: number | undefined;
	let failsafe: number | undefined;
	let errorHold: number | undefined;
	let done: () => void = () => undefined;

	function finish(): void {
		if (finished) return;
		finished = true;
		window.clearInterval(tick);
		window.clearTimeout(failsafe);
		window.clearTimeout(errorHold);
		video?.pause();
		done();
	}

	async function start(wall: boolean): Promise<void> {
		if (!video) return;
		const wantsSound = filmStart(wall) === 'wall-sound';
		try {
			video.muted = !wantsSound;
			muted = video.muted;
			await video.play();
			blocked = false;
		} catch {
			// Sound was refused: try again muted before asking for a tap
			try {
				video.muted = true;
				muted = true;
				await video.play();
				blocked = false;
			} catch {
				blocked = true;
			}
		}
		m.redraw();
	}

	return {
		oncreate(vnode) {
			done = vnode.attrs.onDone;
			startedAt = Date.now();
			video = vnode.dom.querySelector('video');
			tick = window.setInterval(() => m.redraw(), TICK_MS);
			failsafe = window.setTimeout(finish, FILM_FAILSAFE_MS);
			void start(vnode.attrs.wall);
		},
		onbeforeupdate(vnode) {
			done = vnode.attrs.onDone;
		},
		onremove() {
			window.clearInterval(tick);
			window.clearTimeout(failsafe);
			window.clearTimeout(errorHold);
			video?.pause();
		},
		view(vnode) {
			const { film } = vnode.attrs;
			const elapsed = Date.now() - startedAt;
			const wait = skipCountdown(elapsed);

			return m('.opening-film', { 'data-film': 'true' }, [
				m('video.opening-film__video', {
					src: film.url,
					poster: film.poster,
					playsinline: true,
					preload: 'auto',
					'aria-label': film.title,
					onended: finish,
					onclick: () => {
						if (blocked)
							void video?.play().then(() => {
								blocked = false;
								m.redraw();
							});
					},
					onerror: () => {
						// A film that cannot load shows its picture for a moment, then lets the class in
						failed = true;
						logError(new Error('opening film failed to load'), {
							operation: 'openingFilm.load',
							metadata: { url: film.url },
						});
						window.clearTimeout(errorHold);
						errorHold = window.setTimeout(finish, FILM_ERROR_HOLD_MS);
						m.redraw();
					},
				}),
				m('.opening-film__title', film.title),
				blocked && !failed
					? m(
							'button.btn.btn--primary.btn--lg.opening-film__play',
							{
								onclick: () => {
									void start(vnode.attrs.wall);
								},
							},
							t('film.tap_to_play'),
						)
					: null,
				m('.opening-film__controls', [
					muted && !blocked && !failed
						? m(
								'button.btn.btn--secondary.opening-film__sound',
								{
									onclick: () => {
										if (!video) return;
										video.muted = false;
										muted = false;
									},
								},
								t('film.tap_for_sound'),
							)
						: null,
					filmSkippable(elapsed)
						? m('button.btn.btn--secondary.opening-film__skip', { onclick: finish }, t('film.skip'))
						: m('span.opening-film__wait', { role: 'status' }, t('film.skip_in', { n: wait })),
				]),
			]);
		},
	};
}
