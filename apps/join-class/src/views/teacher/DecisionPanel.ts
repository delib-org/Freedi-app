import m from 'mithril';
import '@/styles/console-decision.scss';
import { t } from '@/lib/i18n';
import type { Decision, DecisionRow } from '@/lib/classroom/decision';

/**
 * "The decision" on the teacher's console (design 7.1): the winning proposal, its share and
 * votes, the top three, and who voted. It is drawn at Vote (once closed), Summary and in an open
 * or ended lesson, so the teacher sees the result where she works, not only on the projector.
 * The words say who else sees it ("only your screen" / "the class sees it too").
 */

export interface DecisionPanelAttrs {
	decision: Decision;
}

function scoreLine(decision: Decision): string | null {
	if (decision.percent === null || decision.votes === null) return null;

	return decision.votes === 1
		? t('voting.result_one_vote', { percent: decision.percent })
		: t('voting.result_votes', { percent: decision.percent, n: decision.votes });
}

function bar(row: DecisionRow): m.Vnode {
	return m(
		`li.decision-panel__row${row.winner ? '.decision-panel__row--winner' : ''}`,
		{ key: row.id },
		[
			m(
				'span.decision-panel__track',
				{ style: { '--bar': `${row.percent}%` }, 'aria-hidden': 'true' },
				[m('span.decision-panel__fill')],
			),
			m('span.decision-panel__percent', `${row.percent}%`),
			m('span.decision-panel__text', { dir: 'auto' }, row.text),
		],
	);
}

function body(decision: Decision): m.Children {
	if (decision.kind === 'open' || decision.kind === 'paused') {
		return m(
			'p.decision-panel__note',
			{ role: 'status' },
			t(decision.kind === 'open' ? 'summary.vote_open' : 'voting.paused'),
		);
	}
	if (decision.kind === 'none') {
		return [
			m('p.decision-panel__note', t('summary.no_vote')),
			decision.text
				? [
						m('p.decision-panel__note', `${t('summary.most_agreed')}:`),
						m('p.decision-panel__winner', { dir: 'auto' }, decision.text),
					]
				: null,
		];
	}
	const score = scoreLine(decision);

	return [
		m(
			'p.decision-panel__winner',
			{ dir: 'auto', 'data-testid': 'decision-winner' },
			decision.text ?? t('projector.noDecision'),
		),
		score ? m('p.decision-panel__score', score) : null,
		decision.tie ? m('p.decision-panel__note', t('summary.tie_by_ratings')) : null,
		decision.top.length > 0 ? m('ol.decision-panel__rows', decision.top.map(bar)) : null,
		m(
			'p.decision-panel__turnout',
			t('summary.turnout', { n: decision.voted, m: decision.present }),
		),
	];
}

export const DecisionPanel: m.Component<DecisionPanelAttrs> = {
	view({ attrs }) {
		const { decision } = attrs;

		return m('section.decision-panel', { 'aria-labelledby': 'decision-panel-title' }, [
			m('div.decision-panel__head', [
				m('h2.decision-panel__title#decision-panel-title', t('console.decision')),
				m(
					'p.decision-panel__audience',
					t(
						decision.sharedWithClass
							? 'console.support_panel_shared'
							: 'console.support_panel_private',
					),
				),
			]),
			body(decision),
		]);
	},
};
