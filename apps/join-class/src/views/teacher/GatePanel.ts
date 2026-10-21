import m from 'mithril';
import { t } from '@/lib/i18n';
import type { GateRow } from '@/lib/classroom/consoleHelpers';

/**
 * "הצעות מול השער" (UX section 11): one row per proposal. Text (ellipsis), a
 * track with the terracotta gate line, the consensus score and the verdict in
 * words ("passed the gate" / "0.12 more"). Teal fill past the gate; the colour
 * is never the only cue.
 */

export interface GatePanelAttrs {
	rows: readonly GateRow[];
	gate: number;
}

const SCORE_DECIMALS = 2;

export const GatePanel: m.Component<GatePanelAttrs> = {
	view({ attrs }) {
		return m('section.gate-panel', { 'aria-labelledby': 'gate-panel-title' }, [
			m('h3.gate-panel__title#gate-panel-title', [
				t('console.gate_title'),
				m(
					'span.gate-panel__gate',
					` · ${t('console.gate_at', { gate: attrs.gate.toFixed(SCORE_DECIMALS) })}`,
				),
			]),
			attrs.rows.length === 0
				? m('p.gate-panel__empty', t('console.gate_empty'))
				: m(
						'ul.gate-panel__list',
						attrs.rows.map((row) =>
							m(
								'li.gate-panel__row',
								{ key: row.id, class: row.passed ? 'gate-panel__row--passed' : '' },
								[
									m('span.gate-panel__text', { title: row.text }, row.text),
									m(
										'span.gate-panel__track',
										{ style: { '--fill': String(row.fill), '--gate': String(row.gateFill) } },
										[m('span.gate-panel__fill'), m('span.gate-panel__line')],
									),
									m(
										'span.gate-panel__score',
										{ dir: 'ltr' },
										row.consensus.toFixed(SCORE_DECIMALS),
									),
									m(
										'span.gate-panel__note',
										row.passed
											? t('console.gate_passed')
											: t('console.gate_gap', { gap: row.gap.toFixed(SCORE_DECIMALS) }),
									),
								],
							),
						),
					),
		]);
	},
};
