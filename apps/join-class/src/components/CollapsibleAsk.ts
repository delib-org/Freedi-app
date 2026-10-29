import m from 'mithril';
import { t } from '@/lib/i18n';

/** A question longer than this many characters starts folded to a few lines. */
export const ASK_FOLD_CHARS = 140;

export interface CollapsibleAskAttrs {
	text: string;
}

/** True when the text is long enough to fold. */
export function shouldFold(text: string): boolean {
	return text.length > ASK_FOLD_CHARS;
}

class AskState {
	open = false;
}

/**
 * The lesson's question in large type. A long one folds to three lines with a
 * "Show more" button, so the buttons under it stay in reach on a small phone.
 */
export const CollapsibleAsk: m.ClassComponent<CollapsibleAskAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: AskState }).self = new AskState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: AskState }).self as AskState;
		const { text } = vnode.attrs;
		const fold = shouldFold(text);
		const folded = fold && !self.open;

		return m('.frame__ask-wrap', [
			m(
				'p.frame__ask',
				{
					dir: 'auto',
					'data-testid': 'proposals-ask',
					class: folded ? 'frame__ask--folded' : '',
				},
				text,
			),
			fold
				? m(
						'button.btn.btn--text.frame__ask-toggle',
						{
							type: 'button',
							'aria-expanded': self.open ? 'true' : 'false',
							'data-testid': 'proposals-ask-toggle',
							onclick: () => {
								self.open = !self.open;
							},
						},
						t(self.open ? 'common.show_less' : 'common.show_more'),
					)
				: null,
		]);
	},
};
