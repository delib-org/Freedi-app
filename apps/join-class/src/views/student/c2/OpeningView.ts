import m from 'mithril';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { IntroText, blocksFromPlainText } from '@/components/IntroText';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { fetchIntroBlocks } from '@/lib/classroom/introData';
import type { IntroBlock } from '@/lib/classroom/introText';
import { introVideosOf, projectorVideoOf } from '@/lib/classroom/introVideos';
import { challengeOf } from '../c2/c2Helpers';
import { IntroVideoRows } from '@/components/IntroVideoRows';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 1, Opening (UX 14.C): the lesson question on a card, then the teacher's
 * introduction text, then its videos. The text shows `description` as plain
 * paragraphs at once and swaps in the formatted version after one `get` of the
 * paragraph children (a failed get keeps the plain text and shows no error).
 * No video loads until the student taps it. No button: the teacher opens the
 * next step.
 */

interface OpeningState {
	/** Formatted blocks once fetched; null while loading or after a failed get. */
	blocks: IntroBlock[] | null;
	/** The `description` the current fetch (or result) belongs to. */
	fetchedFor: string | null;
	openId: string | null;
	failedIds: Set<string>;
	alive: boolean;
}

function fetchBlocks(state: OpeningState, mainId: string, description: string): void {
	state.fetchedFor = description;
	void fetchIntroBlocks(mainId)
		.then((saved) => {
			if (!state.alive || state.fetchedFor !== description) return;
			state.blocks = saved;
			m.redraw();
		})
		.catch((error: unknown) => {
			console.error('[Opening] introduction text fetch failed:', error);
		});
}

export const OpeningView: m.Component<StepAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as OpeningState;
		state.blocks = null;
		state.fetchedFor = null;
		state.openId = null;
		state.failedIds = new Set<string>();
		state.alive = true;
	},

	onremove(vnode) {
		(vnode.state as unknown as OpeningState).alive = false;
	},

	view(vnode) {
		const state = vnode.state as unknown as OpeningState;
		const { main } = vnode.attrs;
		const question = challengeOf(getSubQuestions())?.statement ?? main.statement;
		const videos = introVideosOf(main);
		const description = (main.description ?? '').trim();
		// A lesson without introduction text never queries for paragraphs
		if (description !== '' && state.fetchedFor !== description) {
			fetchBlocks(state, main.statementId, description);
		}
		const blocks = description === '' ? [] : (state.blocks ?? blocksFromPlainText(description));
		const empty = blocks.length === 0 && videos.length === 0;

		return m(
			StudentFrame,
			{
				headerLine: stepLabel('opening'),
				instruction: videos.length > 0 ? t('opening.watch') : t('opening.read'),
			},
			[
				m('.opening', { class: empty ? 'opening--centered' : '' }, [
					m('article.opening__card', [
						m('p.opening__eyebrow', t('opening.eyebrow')),
						m('p.opening__question', question),
					]),
					m(IntroText, { blocks, size: 'phone' }),
					m(IntroVideoRows, {
						videos,
						liveId: projectorVideoOf(main)?.id ?? null,
						openId: state.openId,
						failedIds: state.failedIds,
						onOpen: (id: string) => {
							state.openId = id;
						},
						onFailed: (id: string) => {
							state.failedIds.add(id);
							if (state.openId === id) state.openId = null;
						},
					}),
				]),
			],
		);
	},
};
