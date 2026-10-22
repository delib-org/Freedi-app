import m from 'mithril';
import '@/styles/console-opening.scss';
import { IntroText, blocksFromPlainText } from '@/components/IntroText';
import { IntroVideoRows } from '@/components/IntroVideoRows';
import { t } from '@/lib/i18n';
import { enterFullscreen, fullscreenSupported, onFullscreenChange } from '@/lib/fullscreen';
import { fetchIntroBlocks } from '@/lib/classroom/introData';
import type { IntroBlock } from '@/lib/classroom/introText';
import { introVideosOf, projectorVideoOf } from '@/lib/classroom/introVideos';
import type { Statement } from '@freedi/shared-types';

/**
 * The introduction on the console board at Opening (IA 15.13, UX 15.L): the
 * teacher's text, then the videos, each playable on the teacher's own computer
 * and full screen on the row's player frame. It writes nothing and drives
 * nothing: the projector chooser in the band stays the only way to move the
 * projector. Per tab; the panel leaves with the step.
 */

export interface OpeningPanelAttrs {
	main: Statement;
}

interface PanelState {
	/** Formatted blocks once fetched; null while loading or after a failed get. */
	blocks: IntroBlock[] | null;
	/** The `description` the current fetch (or result) belongs to. */
	fetchedFor: string | null;
	openId: string | null;
	failedIds: Set<string>;
	alive: boolean;
	unsubscribe: (() => void) | null;
}

const PLAN_INTRO_HREF = (mid: string): string => `/t/${mid}/plan?focus=intro`;

function fetchBlocks(state: PanelState, mainId: string, description: string): void {
	state.fetchedFor = description;
	void fetchIntroBlocks(mainId)
		.then((saved) => {
			if (!state.alive || state.fetchedFor !== description) return;
			state.blocks = saved;
			m.redraw();
		})
		.catch((error: unknown) => {
			console.error('[OpeningPanel] introduction text fetch failed:', error);
		});
}

/** Hands focus back to the open row's "full screen" button once the browser leaves full screen. */
function focusFullscreenButton(openId: string | null): void {
	if (!openId || document.fullscreenElement) return;
	document
		.querySelector<HTMLElement>(
			`.intro-video-row__fullscreen[data-video-id="${CSS.escape(openId)}"]`,
		)
		?.focus();
}

function empty(mid: string): m.Children {
	return [
		m('p.opening-panel__empty', t('console.intro.empty')),
		m(
			m.route.Link,
			{ class: 'opening-panel__add', href: PLAN_INTRO_HREF(mid) },
			t('console.intro.add'),
		),
	];
}

export const OpeningPanel: m.Component<OpeningPanelAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as PanelState;
		state.blocks = null;
		state.fetchedFor = null;
		state.openId = null;
		state.failedIds = new Set<string>();
		state.alive = true;
		state.unsubscribe = onFullscreenChange(() => {
			focusFullscreenButton(state.openId);
		});
	},

	onremove(vnode) {
		const state = vnode.state as unknown as PanelState;
		state.alive = false;
		state.unsubscribe?.();
		state.unsubscribe = null;
	},

	view(vnode) {
		const state = vnode.state as unknown as PanelState;
		const { main } = vnode.attrs;
		const mid = main.statementId;
		const videos = introVideosOf(main);
		const description = (main.description ?? '').trim();
		// A lesson without introduction text never queries for paragraphs
		if (description !== '' && state.fetchedFor !== description) {
			fetchBlocks(state, mid, description);
		}
		const blocks = description === '' ? [] : (state.blocks ?? blocksFromPlainText(description));
		const none = blocks.length === 0 && videos.length === 0;

		return m('section.opening-panel', { 'aria-labelledby': 'opening-panel-title' }, [
			m('.opening-panel__head', [
				m('h2.opening-panel__title', { id: 'opening-panel-title' }, t('plan.intro.title')),
				none
					? null
					: m(
							m.route.Link,
							{ class: 'opening-panel__edit', href: PLAN_INTRO_HREF(mid) },
							`${t('console.intro.edit')} ↗`,
						),
			]),
			none
				? empty(mid)
				: [
						m(IntroText, { blocks, size: 'console' }),
						m(IntroVideoRows, {
							videos,
							liveId: projectorVideoOf(main)?.id ?? null,
							openId: state.openId,
							failedIds: state.failedIds,
							failedText: t('console.intro.video_failed'),
							preload: 'metadata',
							onFullscreen: fullscreenSupported()
								? (frame: HTMLElement) => void enterFullscreen(frame)
								: undefined,
							onOpen: (id: string) => {
								state.openId = id;
							},
							onFailed: (id: string) => {
								state.failedIds.add(id);
								if (state.openId === id) state.openId = null;
							},
						}),
					],
		]);
	},
};
