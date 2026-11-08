import m from 'mithril';
import { t } from '../lib/i18n';

export interface LikeButtonAttrs {
	liked: boolean;
	/** Hearts this text has, when the screen shows them */
	count?: number;
	disabled?: boolean;
	onToggle: (liked: boolean) => void;
}

/**
 * A heart on a classmate's story. One tap likes, another un-likes — the
 * round's whole scale, so the widget is one button and says which state it
 * is in twice: the fill, and aria-pressed for whoever cannot see the fill.
 * Props in, vnodes out: the write lives in `lib/proposals.ts`.
 */
export const LikeButton: m.Component<LikeButtonAttrs> = {
	view(vnode) {
		const { liked, count, disabled, onToggle } = vnode.attrs;

		return m(
			'button.like-button',
			{
				type: 'button',
				class: liked ? 'like-button--on' : undefined,
				'aria-pressed': liked ? 'true' : 'false',
				'aria-label': t(liked ? 'round.unlike' : 'round.like'),
				title: t(liked ? 'round.unlike' : 'round.like'),
				disabled: disabled === true,
				onclick: () => onToggle(!liked),
			},
			[
				m('span.like-button__heart', { 'aria-hidden': 'true' }, liked ? '♥' : '♡'),
				m('span.like-button__text', t(liked ? 'round.liked' : 'round.like')),
				count !== undefined && count > 0
					? m('span.like-button__count', { 'aria-hidden': 'true' }, String(count))
					: null,
			],
		);
	},
};
