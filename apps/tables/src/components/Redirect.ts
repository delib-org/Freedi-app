import m from 'mithril';
import { goTo, replaceWith } from '@/lib/navigate';
import { StateBox } from '@/components/StateBox';

export interface RedirectAttrs {
	to: string;
	/** Keep this screen in the history, so browser back returns to it. */
	push?: boolean;
}

/** A screen whose only job is to send the person on (guards, old links, the next step). */
export const Redirect: m.ClosureComponent<RedirectAttrs> = () => ({
	oncreate({ attrs }) {
		if (attrs.push) goTo(attrs.to);
		else replaceWith(attrs.to);
	},
	view() {
		return m(StateBox, { kind: 'loading' });
	},
});
