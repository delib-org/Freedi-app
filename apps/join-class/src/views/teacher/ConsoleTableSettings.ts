import m from 'mithril';
import { allowOwnQuestionsOf, proposalsTurnsOf, speakSecondsOf } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getMainStatement } from '@/lib/store';
import { setTableSetting } from './consoleActions';
import { isBusy } from './consoleState';
import { OwnQuestionsSwitch, ProposalsTurnsSelect, SpeakTimeSelect } from './TableSettingsControls';

/**
 * "השולחנות" group of the console's settings popover (IA 25.4): the lesson's
 * table-talk settings, changeable while the class works. A change applies from
 * the next time a table picks a question (or claims the floor).
 */

export const ConsoleTableSettings: m.Component = {
	view() {
		const main = getMainStatement();

		return m('fieldset.table-settings', [
			m('legend.table-settings__legend', t('console.tables_group')),
			m(OwnQuestionsSwitch, {
				scope: 'console',
				on: allowOwnQuestionsOf(main),
				disabled: !main || isBusy('tableSetting:allowOwnQuestions'),
				onChange: (on: boolean) => void setTableSetting({ allowOwnQuestions: on }),
			}),
			m(SpeakTimeSelect, {
				scope: 'console',
				seconds: speakSecondsOf(main),
				disabled: !main || isBusy('tableSetting:speakSeconds'),
				onChange: (seconds: number) => void setTableSetting({ speakSeconds: seconds }),
			}),
			m(ProposalsTurnsSelect, {
				scope: 'console',
				turns: proposalsTurnsOf(main),
				disabled: !main || isBusy('tableSetting:proposalsTurns'),
				onChange: (turns: number) => void setTableSetting({ proposalsTurns: turns }),
			}),
		]);
	},
};
