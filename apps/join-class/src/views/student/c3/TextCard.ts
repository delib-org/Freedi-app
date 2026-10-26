import m from 'mithril';

export interface TextCardAttrs {
	/** "Answer · Table 5" - the kind and the table, never a tag. */
	eyebrow: string;
	text: string;
	/** The 5 faces (or anything else under the text). */
	footer?: m.Children;
	/** A teal "mine" style for the own-proposal card. */
	mine?: boolean;
	/** The proposal's replies entry (IA 22), on its own row under the faces. */
	replies?: m.Children;
}

/** An answer / proposal card: eyebrow, text (dir=auto), optional faces. */
export const TextCard: m.Component<TextCardAttrs> = {
	view({ attrs }) {
		return m('article.text-card', { class: attrs.mine ? 'text-card--mine' : '' }, [
			m('p.text-card__eyebrow', attrs.eyebrow),
			m('p.text-card__body', { dir: 'auto' }, attrs.text),
			attrs.footer ? m('.text-card__faces', attrs.footer) : null,
			attrs.replies ? m('.text-card__replies', attrs.replies) : null,
		]);
	},
};
