import m from 'mithril';
import type { ClassVoteOrder, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { liveResultsOn, voteOrderOf } from '@/lib/classroom/voteResults';
import { setVoteDisplay, setVoteOrder } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * The lesson's vote settings in the console's settings popover: what the
 * students' vote screen shows. Stored on the challenge question
 * (statementSettings.voteDisplay); without a challenge there is no vote yet,
 * so the controls are disabled. The order is ONE setting for every phone and
 * the projector (IA 21).
 */

export interface VoteDisplaySettingsAttrs {
	challenge: Statement | null;
}

// >>> voteSummary BEGIN
interface OrderSpec {
	value: ClassVoteOrder;
	labelKey: string;
	helpKey: string;
}

const ORDERS: readonly OrderSpec[] = [
	{
		value: 'consensus',
		labelKey: 'console.vote_order_consensus',
		helpKey: 'console.vote_order_consensus_help',
	},
	{
		value: 'votes',
		labelKey: 'console.vote_order_votes',
		helpKey: 'console.vote_order_votes_help',
	},
	{
		value: 'random',
		labelKey: 'console.vote_order_random',
		helpKey: 'console.vote_order_random_help',
	},
];

function orderRow(spec: OrderSpec, challenge: Statement | null): m.Vnode {
	const id = `vote-order-${spec.value}`;

	return m('.vote-display__row', [
		m('input.vote-display__input', {
			id,
			type: 'radio',
			name: 'vote-order',
			value: spec.value,
			checked: voteOrderOf(challenge) === spec.value,
			disabled: !challenge || isBusy('voteDisplay:order'),
			'aria-describedby': `${id}-help`,
			'data-testid': id,
			onchange: () => {
				if (challenge) void setVoteOrder(challenge.statementId, spec.value);
			},
		}),
		m('label.vote-display__label', { for: id }, t(spec.labelKey)),
		m('p.vote-display__help', { id: `${id}-help` }, t(spec.helpKey)),
	]);
}
// >>> voteSummary END

function liveResultsRow(challenge: Statement | null): m.Vnode {
	const id = 'vote-display-liveResults';

	return m('.vote-display__row', [
		m('input.vote-display__input', {
			id,
			type: 'checkbox',
			role: 'switch',
			checked: liveResultsOn(challenge),
			disabled: !challenge || isBusy('voteDisplay:liveResults'),
			'aria-describedby': `${id}-help`,
			'data-testid': id,
			onchange: (e: Event) => {
				if (!challenge) return;
				const value = (e.target as HTMLInputElement).checked;
				void setVoteDisplay(challenge.statementId, 'liveResults', value);
			},
		}),
		m('label.vote-display__label', { for: id }, t('console.vote_live_results')),
		m('p.vote-display__help', { id: `${id}-help` }, t('console.vote_live_results_help')),
	]);
}

export const VoteDisplaySettings: m.Component<VoteDisplaySettingsAttrs> = {
	view({ attrs }) {
		return m('fieldset.vote-display', [
			m('legend.vote-display__legend', t('console.vote_settings')),
			liveResultsRow(attrs.challenge),
			// >>> voteSummary BEGIN
			m('fieldset.vote-display__group', { role: 'radiogroup' }, [
				m('legend.vote-display__subtitle', t('console.vote_order')),
				ORDERS.map((spec) => orderRow(spec, attrs.challenge)),
			]),
			// >>> voteSummary END
		]);
	},
};
