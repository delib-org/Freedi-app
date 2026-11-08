import m from 'mithril';

export interface SectionHeadAttrs {
	/** Ties the section's landmark to its heading */
	id: string;
	title: string;
	/** The one action that belongs to this section: a pill on the far end */
	action?: m.Children;
}

/** A section's heading line: the title, and at most one action beside it */
export const SectionHead: m.Component<SectionHeadAttrs> = {
	view({ attrs }) {
		return m('.sec-head', [
			m('h2.sec-head__title', { id: attrs.id }, attrs.title),
			attrs.action ? m('.sec-head__action', attrs.action) : null,
		]);
	},
};
