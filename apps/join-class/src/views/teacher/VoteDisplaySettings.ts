import m from 'mithril';
import type { ClassVoteDisplay, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { liveResultsOn } from '@/lib/classroom/voteResults';
import { setVoteDisplay } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * The lesson's vote switches in the console's settings popover: what the
 * students' vote screen shows. Stored on the challenge question
 * (statementSettings.voteDisplay); without a challenge there is no vote yet,
 * so the switches are disabled.
 */

export interface VoteDisplaySettingsAttrs {
	challenge: Statement | null;
}

interface SwitchSpec {
	field: keyof ClassVoteDisplay;
	labelKey: string;
	helpKey: string;
	isOn: (challenge: Statement | null) => boolean;
}

const SWITCHES: readonly SwitchSpec[] = [
	{
		field: 'liveResults',
		labelKey: 'console.vote_live_results',
		helpKey: 'console.vote_live_results_help',
		isOn: liveResultsOn,
	},
];

function switchRow(spec: SwitchSpec, challenge: Statement | null): m.Vnode {
	const id = `vote-display-${spec.field}`;
	const on = spec.isOn(challenge);

	return m('.vote-display__row', [
		m('input.vote-display__input', {
			id,
			type: 'checkbox',
			role: 'switch',
			checked: on,
			disabled: !challenge || isBusy(`voteDisplay:${spec.field}`),
			'aria-describedby': `${id}-help`,
			'data-testid': id,
			onchange: (e: Event) => {
				if (!challenge) return;
				const value = (e.target as HTMLInputElement).checked;
				void setVoteDisplay(challenge.statementId, spec.field, value);
			},
		}),
		m('label.vote-display__label', { for: id }, t(spec.labelKey)),
		m('p.vote-display__help', { id: `${id}-help` }, t(spec.helpKey)),
	]);
}

export const VoteDisplaySettings: m.Component<VoteDisplaySettingsAttrs> = {
	view({ attrs }) {
		return m('fieldset.vote-display', [
			m('legend.vote-display__legend', t('console.vote_settings')),
			SWITCHES.map((spec) => switchRow(spec, attrs.challenge)),
		]);
	},
};
