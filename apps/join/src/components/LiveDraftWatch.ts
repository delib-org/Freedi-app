import m from 'mithril';
import { t } from '@/lib/i18n';
import { getLiveDrafts, getRecentReactions, sendReaction, LiveDraft } from '@/lib/liveDrafts';

interface LiveDraftWatchAttrs {
	onClose: () => void;
}

const REACTION_EMOJI = ['👍', '❤️', '💡', '🔥'];

/** Full-screen overlay where the table watches drafts being written live.
 *  One card per broadcaster; the text streams in letter-by-letter with a
 *  blinking caret, and watchers can send quick emoji that appear as chips
 *  under the draft for everyone (including the writer).
 *
 *  Deliberately an overlay, not a route: the `/m/:mid/q/:qid` Solutions
 *  instance stays mounted underneath with its subscriptions intact, and
 *  Mithril's component-instance reuse never gets involved. */
export const LiveDraftWatch: m.Component<LiveDraftWatchAttrs> = {
	view(vnode) {
		const { onClose } = vnode.attrs;
		const drafts = getLiveDrafts({ excludeSelf: true });

		return m(
			'.live-watch',
			{
				onclick: (e: Event) => {
					if (e.target === e.currentTarget) onClose();
				},
			},
			m('.live-watch__panel', [
				m('.live-watch__header', [
					m('span.live-watch__header-dot', { 'aria-hidden': 'true' }),
					m('h2.live-watch__title', t('live.watch.title')),
					m(
						'button.live-watch__close',
						{
							type: 'button',
							'aria-label': t('live.watch.close'),
							onclick: onClose,
						},
						'×',
					),
				]),
				drafts.length === 0
					? m('.live-watch__empty', t('live.ended'))
					: m(
							'.live-watch__cards',
							drafts.map((draft) => renderDraftCard(draft)),
						),
			]),
		);
	},
};

function renderDraftCard(draft: LiveDraft): m.Children {
	const recent = getRecentReactions(draft);

	return m('.live-watch__card', { key: draft.userId }, [
		m('.live-watch__card-header', [
			m('span.live-watch__author-dot', {
				style: `background: ${draft.color}`,
				'aria-hidden': 'true',
			}),
			m('span.live-watch__author', draft.displayName),
		]),
		draft.text.length === 0
			? m('p.live-watch__thinking', t('live.thinking', { name: draft.displayName }))
			: m(
					// dir=auto makes each draft follow its own script (Hebrew/Arabic/
					// Farsi drafts flow RTL even in an LTR UI, and vice versa).
					'p.live-watch__text',
					{ dir: 'auto' },
					[draft.text, m('span.live-watch__caret', { 'aria-hidden': 'true' })],
				),
		recent.length > 0
			? m(
					'.live-watch__recent',
					recent.map((r) =>
						m('span.live-watch__chip', { key: r.reactorId }, `${r.emoji} ${r.displayName}`),
					),
				)
			: null,
		m(
			'.live-watch__reactions',
			REACTION_EMOJI.map((emoji) =>
				m(
					'button.live-watch__reaction-btn',
					{
						type: 'button',
						'aria-label': t('live.reaction.aria', { emoji, name: draft.displayName }),
						onclick: () => void sendReaction(draft.userId, emoji),
					},
					emoji,
				),
			),
		),
	]);
}
