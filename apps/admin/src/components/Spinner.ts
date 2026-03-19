import m from 'mithril';

export interface SpinnerAttrs {
	inline?: boolean;
}

export const Spinner: m.Component<SpinnerAttrs> = {
	view(vnode) {
		const inline = vnode.attrs.inline;
		return m(
			`.spinner${inline ? '.spinner--inline' : ''}`,
			m('.spinner__circle')
		);
	},
};
