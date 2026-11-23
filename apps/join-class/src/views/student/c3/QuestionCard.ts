import m from 'mithril';

/**
 * "The question on the table": a prominent card in the middle of every Table talk
 * state that has a question (who answers, answering, answered, move on). Its label
 * ("The question on the table") is the screen's heading (h1) right above it, so a
 * screen reader hears the label first and focus lands there on a state change.
 * Nothing is drawn while the question text is not loaded yet.
 */

export interface QuestionCardAttrs {
	/** The question text; empty while it is still being read. */
	text: string;
}

export const QuestionCard: m.Component<QuestionCardAttrs> = {
	view({ attrs }) {
		if (!attrs.text) return null;

		return m('section.question-card', { 'data-testid': 'question-card' }, [
			m('p.question-card__text', { dir: 'auto', 'data-testid': 'question-card-text' }, attrs.text),
		]);
	},
};
