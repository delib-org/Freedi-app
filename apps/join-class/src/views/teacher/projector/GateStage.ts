import m from 'mithril';
import { t } from '@/lib/i18n';
import { GAP_DECIMALS, capChips } from './gateLogic';
import type { GateItem, GateView } from './gateLogic';

/**
 * The big gate on the wall (Agora's goal line, ported): a frame with two doors
 * that swing open the moment an option's support reaches the threshold, the
 * options that got through underneath, and (at the vote) the ones still on
 * their way with the distance they have left. Presentation only; the rules
 * live in gateLogic.ts.
 */

export interface GateStageProps {
	view: GateView;
	/** Also list the options still below the gate, each with what it lacks. */
	showWaiting: boolean;
}

function statusText(view: GateView): string {
	if (!view.open) return t('projector.gateClosed');

	return view.passedCount === 1
		? t('projector.gateOpenOne')
		: t('projector.gateOpenMany', { n: view.passedCount });
}

function frame(open: boolean): m.Vnode {
	return m('.gate-stage__frame', { 'aria-hidden': 'true' }, [
		m('.gate-stage__lintel'),
		m('.gate-stage__opening', [
			m('.gate-stage__light'),
			m('.gate-stage__door.gate-stage__door--first'),
			m('.gate-stage__door.gate-stage__door--second'),
		]),
		m('.gate-stage__sill', { class: open ? 'gate-stage__sill--lit' : '' }),
	]);
}

function throughChip(item: GateItem): m.Vnode {
	return m('li.gate-stage__chip.gate-stage__chip--through', { key: item.id }, [
		m('span.gate-stage__chip-text', item.text),
		m('span.gate-stage__chip-note', t('projector.passed')),
	]);
}

function waitingChip(item: GateItem): m.Vnode {
	return m('li.gate-stage__chip.gate-stage__chip--waiting', { key: item.id }, [
		m('span.gate-stage__chip-text', item.text),
		m('span.gate-stage__chip-note', t('console.gate_gap', { gap: item.gap.toFixed(GAP_DECIMALS) })),
	]);
}

function moreChip(hidden: number): m.Vnode {
	return m('li.gate-stage__chip.gate-stage__chip--more', { key: 'more' }, [
		m('span.gate-stage__chip-text', t('projector.gateMore', { n: hidden })),
	]);
}

export const GateStage: m.Component<GateStageProps> = {
	view({ attrs }) {
		const { view, showWaiting } = attrs;
		const chips = capChips(view.through, showWaiting ? view.waiting : []);

		return m(
			'section.gate-stage',
			{
				class: view.open ? 'gate-stage--open' : 'gate-stage--closed',
				'aria-label': t('projector.gateLabel'),
			},
			[
				frame(view.open),
				m('p.gate-stage__status', { 'aria-live': 'polite' }, statusText(view)),
				chips.through.length + chips.waiting.length > 0
					? m('ul.gate-stage__chips', [
							...chips.through.map(throughChip),
							...chips.waiting.map(waitingChip),
							...(chips.hidden > 0 ? [moreChip(chips.hidden)] : []),
						])
					: null,
			],
		);
	},
};
