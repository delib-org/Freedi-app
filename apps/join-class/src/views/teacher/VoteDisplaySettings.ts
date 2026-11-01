import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { liveResultsOn } from '@/lib/classroom/voteResults';
import { setVoteDisplay } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * The lesson's vote settings in the console's settings popover: what the
 * students' vote screen shows. Stored on the challenge question
 * (statementSettings.voteDisplay); without a challenge there is no vote yet,
 * so the controls are disabled. The order of the proposals lives on the Vote
 * step's control row (VoteOrderSwitch), not here.
 */

export interface VoteDisplaySettingsAttrs {
	challenge: Statement | null;
}

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
		]);
	},
};
