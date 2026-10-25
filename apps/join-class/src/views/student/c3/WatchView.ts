import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	focusReturnTarget,
	shouldPopHistory,
	watchHistoryState,
} from '@/lib/classroom/liveWriting';
import { Sheet } from './Sheet';

export interface WatchPick {
	uid: string;
	name: string;
}

export interface WatchViewAttrs {
	uid: string;
	name: string;
	text: string;
	state: 'live' | 'sent' | 'stopped';
	/** The picker entries in seating order; shown from two on. */
	picks: WatchPick[];
	onPick: (uid: string) => void;
	onClose: () => void;
}

const TITLE_ID = 'watch-title';
/** How near the bottom still counts as "at the bottom" (px). */
const BOTTOM_SLACK_PX = 6;

interface WatchState {
	token: string;
	pushed: boolean;
	poppedByUser: boolean;
	onPop: (() => void) | null;
	/** The reader is at the bottom of the text: new text keeps it scrolled to the end. */
	follow: boolean;
}

/** Closing returns focus to the line, or to the strip's current pill when the line is gone. */
function returnFocus(): HTMLElement | null {
	const line = document.querySelector<HTMLElement>('[data-testid="live-line"]');
	const pill = document.querySelector<HTMLElement>('.substeps__pill[aria-current="true"]');

	return focusReturnTarget(line !== null) === 'line' ? line : pill;
}

/**
 * The watch view (UX 2): one tablemate's text, read only, updating as they type.
 * A compact Sheet with no route: one history entry is pushed on open so the back
 * gesture closes it. The text is not a live region (it is read on focus, never
 * letter by letter); the caret is its own keyed node so a text update never
 * restarts its pulse. The view never closes itself.
 */
export const WatchView: m.ClassComponent<WatchViewAttrs> = {
	oninit(vnode) {
		const self: WatchState = {
			token: String(Date.now()),
			pushed: false,
			poppedByUser: false,
			onPop: null,
			follow: true,
		};
		(vnode.state as { self?: WatchState }).self = self;
		try {
			history.pushState(watchHistoryState(self.token), '', location.href);
			self.pushed = true;
		} catch (error) {
			console.error('[WatchView] history push failed:', error);
		}
		self.onPop = (): void => {
			self.poppedByUser = true;
			vnode.attrs.onClose();
			m.redraw();
		};
		window.addEventListener('popstate', self.onPop);
	},

	onremove(vnode) {
		const self = (vnode.state as { self?: WatchState }).self as WatchState;
		if (self.onPop) window.removeEventListener('popstate', self.onPop);
		// closed by a button, Escape or the scrim: take our own history entry back off
		if (self.pushed && !self.poppedByUser && shouldPopHistory(history.state, self.token))
			history.back();
	},

	view(vnode) {
		const self = (vnode.state as { self?: WatchState }).self as WatchState;
		const { uid, name, text, state, picks, onPick, onClose } = vnode.attrs;
		const live = state === 'live';
		const heading =
			state === 'live'
				? t('answer.live_one', { name })
				: t(state === 'sent' ? 'answer.watch_sent' : 'answer.watch_stopped', { name });
		const picker =
			picks.length >= 2
				? m(
						'.watch__writers',
						{ role: 'group', 'aria-label': t('answer.live_many', { count: picks.length }) },
						picks.map((p) =>
							m(
								'button.watch__writer',
								{
									key: p.uid,
									type: 'button',
									class: p.uid === uid ? 'watch__writer--on' : '',
									'aria-pressed': p.uid === uid ? 'true' : 'false',
									'data-testid': 'watch-writer',
									'data-uid': p.uid,
									onclick: () => onPick(p.uid),
								},
								p.name,
							),
						),
					)
				: null;

		return m(
			Sheet,
			{
				title: heading,
				compact: true,
				labelledBy: TITLE_ID,
				testId: 'watch-view',
				state,
				footer: picker,
				onClose,
				returnFocus,
			},
			m('.watch', [
				m(
					'h2.watch__title',
					{ key: 'title', id: TITLE_ID, tabindex: -1, 'data-autofocus': '' },
					heading,
				),
				m(
					'.watch__text',
					{
						// a new writer is a new node: it opens at the top and fades in
						key: uid,
						class: live ? '' : `watch__text--${state === 'sent' ? 'sent' : 'ended'}`,
						role: 'region',
						tabindex: 0,
						dir: 'auto',
						'aria-labelledby': TITLE_ID,
						'data-testid': 'watch-text',
						onscroll: (event: Event & { redraw?: boolean }) => {
							event.redraw = false;
							const el = event.target as HTMLElement;
							self.follow = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
						},
						onupdate: (node: m.VnodeDOM) => {
							const el = node.dom as HTMLElement;
							if (self.follow) el.scrollTop = el.scrollHeight;
						},
						oncreate: () => {
							self.follow = true;
						},
					},
					[
						m('span.watch__body', text),
						live ? m('span.watch__caret', { 'aria-hidden': 'true' }) : null,
					],
				),
			]),
		);
	},
};
