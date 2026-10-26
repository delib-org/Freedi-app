import m from 'mithril';
import { t } from '@/lib/i18n';
import type { QuestionGroup, WrittenText } from '@/lib/classroom/textsHelpers';
import { consoleState } from './consoleState';
import { getMainStatement } from '@/lib/store';
import { FlagsPanel } from './FlagsPanel';
import { HideControl } from './HideControl';
import { ProposalBlock } from './ProposalBlock';
import { stopTeacherReplies, watchTeacherReplies } from './TeacherReplies';

/**
 * "מה כתבו" (?view=texts): the teacher's language flags on top (IA 24.4), then
 * the texts grouped by question, then table. A proposal is a block with its
 * reply thread under it (IA 24.1); an answer is a plain card. Hide / restore
 * (Join's `hide` flag) is one labelled control everywhere (IA 24.2) and, only
 * where the table has a "no device" member, "rate for ..." is offered.
 */

export interface WhatTheyWroteAttrs {
	groups: readonly QuestionGroup[];
}

function card(text: WrittenText, noDeviceNames: readonly string[]): m.Vnode {
	return m('li.written-card', { key: text.id, class: text.hidden ? 'written-card--hidden' : '' }, [
		m('p.written-card__text', { dir: 'auto' }, text.text),
		m('p.written-card__meta', [
			text.author ? m('span', text.author) : null,
			m('span', t('console.ratings_n', { count: text.ratings })),
			text.hidden ? m('span.written-card__flag.chip-hidden', t('console.hidden_flag')) : null,
		]),
		m('div.written-card__actions', [
			m(HideControl, { statementId: text.id, hidden: text.hidden, testId: 'answer-hide' }),
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

/** The title row of a question; a table's own question carries the hide control. */
function questionHead(group: QuestionGroup): m.Vnode {
	return m('div.written__question-head', [
		m('h3.written__question-title', group.title),
		group.hidden ? m('span.written-card__flag.chip-hidden', t('console.hidden_flag')) : null,
		group.ownQuestion
			? m(HideControl, {
					statementId: group.questionId,
					hidden: group.hidden,
					testId: 'written-question-hide',
				})
			: null,
	]);
}

export const WhatTheyWrote: m.Component<WhatTheyWroteAttrs> = {
	oninit() {
		const main = getMainStatement();
		watchTeacherReplies(main?.topParentId || consoleState.mainId);
	},

	onremove() {
		stopTeacherReplies();
	},

	view({ attrs }) {
		const total = attrs.groups.reduce(
			(sum, g) => sum + g.groups.reduce((s, tg) => s + tg.texts.length, 0),
			0,
		);
		if (total === 0) {
			return m('div.written', [m(FlagsPanel), m('p.written__empty', t('console.texts_empty'))]);
		}

		return m('div.written', [
			m(FlagsPanel),
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
										tg.texts.map((text) =>
											g.challenge
												? m(ProposalBlock, { text, mainId: consoleState.mainId })
												: card(text, tg.noDeviceNames),
										),
									),
								]),
							),
						],
					),
				),
		]);
	},
};
