import m from 'mithril';
import { t } from '@/lib/i18n';
import type { QuestionGroup, WrittenText } from '@/lib/classroom/textsHelpers';
import { setHidden } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * "מה כתבו" (?view=texts): display-only cards grouped by question, then table,
 * with hide / restore (Join's `hide` flag) and, only where the table has a "no
 * device" member, "rate for ...".
 */

export interface WhatTheyWroteAttrs {
	groups: readonly QuestionGroup[];
}

function card(text: WrittenText, noDeviceNames: readonly string[]): m.Vnode {
	return m('li.written-card', { key: text.id, class: text.hidden ? 'written-card--hidden' : '' }, [
		m('p.written-card__text', text.text),
		m('p.written-card__meta', [
			text.author ? m('span', text.author) : null,
			m('span', t('console.ratings_n', { count: text.ratings })),
			text.hidden ? m('span.written-card__flag', t('console.hidden_flag')) : null,
		]),
		m('div.written-card__actions', [
			m(
				'button.btn.btn--tertiary',
				{
					type: 'button',
					disabled: isBusy(`hide:${text.id}`),
					onclick: () => void setHidden(text.id, !text.hidden),
				},
				t(text.hidden ? 'console.restore' : 'console.hide'),
			),
			// TODO(C1): rating on behalf of a "no device" member needs an engine
			// callable (the evaluation is written for a uid that has no device).
			// Until it exists the button is shown disabled, only where it applies.
			noDeviceNames.length > 0
				? m(
						'button.btn.btn--tertiary.written-card__rate-for',
						{ type: 'button', disabled: true, title: t('console.rate_for_soon') },
						t('console.rate_for', { name: noDeviceNames.join(', ') }),
					)
				: null,
		]),
	]);
}

/** The title row of a question; a table's own question carries hide / restore. */
function questionHead(group: QuestionGroup): m.Vnode {
	return m('div.written__question-head', [
		m('h3.written__question-title', group.title),
		group.hidden ? m('span.written-card__flag', t('console.hidden_flag')) : null,
		group.ownQuestion
			? m(
					'button.btn.btn--tertiary',
					{
						type: 'button',
						'data-testid': 'written-question-hide',
						disabled: isBusy(`hide:${group.questionId}`),
						onclick: () => void setHidden(group.questionId, !group.hidden),
					},
					t(group.hidden ? 'console.restore' : 'console.hide'),
				)
			: null,
	]);
}

export const WhatTheyWrote: m.Component<WhatTheyWroteAttrs> = {
	view({ attrs }) {
		const total = attrs.groups.reduce(
			(sum, g) => sum + g.groups.reduce((s, tg) => s + tg.texts.length, 0),
			0,
		);
		if (total === 0) return m('p.written__empty', t('console.texts_empty'));

		return m(
			'div.written',
			attrs.groups
				.filter((g) => g.groups.length > 0)
				.map((g) =>
					m(
						'section.written__question',
						{ key: g.questionId, class: g.hidden ? 'written__question--hidden' : '' },
						[
							questionHead(g),
							g.groups.map((tg) =>
								m('div.written__group', { key: tg.tableId ?? 'none' }, [
									m(
										'h4.written__group-title',
										tg.n === null ? t('console.unplaced_name') : t('console.table_n', { n: tg.n }),
									),
									m(
										'ul.written__list',
										tg.texts.map((text) => card(text, tg.noDeviceNames)),
									),
								]),
							),
						],
					),
				),
		);
	},
};
