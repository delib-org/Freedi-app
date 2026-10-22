import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	GATE_MAX,
	GATE_MIN,
	GATE_STEP,
	readLessonGate,
	writeLessonGate,
} from '@/lib/classroom/gateControl';
import { bindOutsideClose, popoverKeydown, unbindOutsideClose } from './barPopover';

/**
 * The console's small settings popover: the lesson's agreement gate, the one
 * setting a teacher moves mid-lesson. A native <details> (opens and closes with
 * the keyboard); Escape and a click elsewhere close it too.
 */

const GATE_DECIMALS = 2;

export const ConsoleSettings: m.Component = {
	oncreate: bindOutsideClose,

	onremove: unbindOutsideClose,

	view() {
		const gate = readLessonGate();

		return m('details.console__settings', { onkeydown: popoverKeydown }, [
			m('summary.btn.btn--tertiary.console__settings-toggle', t('console.settings')),
			m('.console__settings-panel', [
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
				m(
					'span.console__settings-value',
					t('console.gate.value', { value: gate.toFixed(GATE_DECIMALS) }),
				),
				m('p.console__settings-help#gate-slider-help', t('console.gate.help')),
			]),
		]);
	},
};
