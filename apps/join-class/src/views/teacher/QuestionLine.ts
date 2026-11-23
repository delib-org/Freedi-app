import m from 'mithril';
import { t } from '@/lib/i18n';

/**
 * "Question to solve: ... [Change]": one quiet line under the join card, so the teacher sees
 * which question the class will work on without a box around it. "Change" opens the plan at
 * its question.
 */

export interface QuestionLineAttrs {
	mid: string;
	/** The text of the question to solve. */
	question: string;
}

export const QuestionLine: m.Component<QuestionLineAttrs> = {
	view({ attrs }) {
		return m('p.question-line', { 'data-testid': 'question-line' }, [
			m('span.question-line__label', t('console.question_line')),
			m('q.question-line__text', { dir: 'auto' }, attrs.question),
			m(
				m.route.Link,
				{
					class: 'question-line__change',
					href: `/t/${attrs.mid}/plan?focus=challenge`,
					'data-testid': 'question-change',
				},
				t('console.question_change'),
			),
		]);
	},
};
