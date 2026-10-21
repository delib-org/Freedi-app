import m from 'mithril';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { challengeOf, videoUrlOf, youtubeEmbedUrl } from '../c2/c2Helpers';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 1, Opening (UX §2.3): the lesson question on a card under "Watch
 * together". A dilemma video exists only when the workspace has a `videoUrl`;
 * it never autoplays: nothing is loaded until the student taps play. No
 * button, the teacher opens the next step.
 */

interface OpeningState {
	playing: boolean;
	failed: boolean;
}

function player(url: string, state: OpeningState): m.Vnode {
	const embed = youtubeEmbedUrl(url);
	if (embed) {
		return m('iframe.opening__player', {
			src: embed,
			title: t('opening.video_title'),
			allow: 'autoplay; encrypted-media; picture-in-picture',
			allowfullscreen: true,
		});
	}

	return m('video.opening__player', {
		src: url,
		controls: true,
		autoplay: true,
		playsinline: true,
		'aria-label': t('opening.video_title'),
		onerror: () => {
			state.failed = true;
			state.playing = false;
			m.redraw();
		},
	});
}

function videoCard(url: string, state: OpeningState): m.Vnode {
	if (state.failed) {
		return m(
			'.opening__video',
			m('p.opening__video-note', { role: 'status' }, t('opening.video_failed')),
		);
	}
	if (state.playing) return m('.opening__video', player(url, state));

	return m(
		'.opening__video',
		m(
			'button.btn.btn--secondary.opening__play',
			{
				type: 'button',
				onclick: () => {
					state.playing = true;
				},
			},
			[m('span.opening__play-icon', { 'aria-hidden': 'true' }), t('opening.play')],
		),
	);
}

export const OpeningView: m.Component<StepAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as OpeningState;
		state.playing = false;
		state.failed = false;
	},

	view(vnode) {
		const state = vnode.state as unknown as OpeningState;
		const { main } = vnode.attrs;
		const question = challengeOf(getSubQuestions())?.statement ?? main.statement;
		const video = videoUrlOf(main);

		return m(StudentFrame, { headerLine: stepLabel('opening'), instruction: t('opening.watch') }, [
			m('.opening', { class: video ? '' : 'opening--centered' }, [
				m('article.opening__card', [
					m('p.opening__eyebrow', t('opening.eyebrow')),
					m('p.opening__question', question),
				]),
				video ? videoCard(video, state) : null,
			]),
		]);
	},
};
