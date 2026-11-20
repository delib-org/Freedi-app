import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	GATE_MAX,
	GATE_MIN,
	GATE_STEP,
	readLessonGate,
	writeLessonGate,
} from '@/lib/classroom/gateControl';
import { gatePercent } from '@/lib/classroom/gatePercent';
import { bindOutsideClose, popoverKeydown, unbindOutsideClose } from './barPopover';
import { ConsoleTableSettings } from './ConsoleTableSettings';
import { ConsoleClassSize } from './ConsoleClassSize';
import { LessonLookSettings } from './LessonLookSettings';

/**
 * The console's small settings popover: the lesson's agreement gate and the lesson's look. A native <details> (opens and closes with
 * the keyboard); Escape and a click elsewhere close it too.
 */

/** Whether the panel is open: the "More" panel and the step menu both ask to open it. */
let settingsOpen = false;

/** Open the settings (the step menu's "seats at a table" item lands here) and focus the first field of the tables group. */
export function requestSettingsOpen(): void {
	settingsOpen = true;
	// Draw now (the panel may have just been opened): the field exists only once drawn.
	m.redraw.sync();
	document
		.querySelector<HTMLElement>(
			'.console__settings .table-settings :is(input, select):not(:disabled)',
		)
		?.focus();
}

export const ConsoleSettings: m.Component = {
	oncreate: bindOutsideClose,

	onremove: unbindOutsideClose,

	view() {
		const gate = readLessonGate();

		return m(
			'details.console__settings',
			{
				open: settingsOpen,
				onkeydown: popoverKeydown,
				ontoggle: (event: Event) => {
					settingsOpen = (event.target as HTMLDetailsElement).open;
				},
			},
			[
				m('summary.btn.btn--tertiary.console__settings-toggle', t('console.settings')),
				m('.console__settings-panel', [
					m('p.console__settings-scope', t('console.settings_scope')),
					m('label.console__settings-label', { for: 'gate-slider' }, t('console.gate.label')),
					m('input.console__settings-slider#gate-slider', {
						type: 'range',
						min: String(GATE_MIN),
						max: String(GATE_MAX),
						step: String(GATE_STEP),
						value: String(gate),
						'data-testid': 'gate-slider',
						'aria-describedby': 'gate-slider-help',
						oninput: (e: Event) => {
							writeLessonGate(Number((e.target as HTMLInputElement).value));
						},
					}),
					m('span.console__settings-value', t('console.gate.value', { value: gatePercent(gate) })),
					m('p.console__settings-help#gate-slider-help', t('console.gate.help')),
					m(ConsoleClassSize),
					m(ConsoleTableSettings),
					m(LessonLookSettings),
				]),
			],
		);
	},
};
