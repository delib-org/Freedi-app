import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	GATE_MAX,
	GATE_MIN,
	GATE_STEP,
	readLessonGate,
	writeLessonGate,
} from '@/lib/classroom/gateControl';

/**
 * The console's small settings popover: the lesson's agreement gate, the one
 * setting a teacher moves mid-lesson. A native <details> (opens and closes with
 * the keyboard); Escape and a click elsewhere close it too.
 */

const GATE_DECIMALS = 2;

function closePanel(details: HTMLDetailsElement, returnFocus: boolean): void {
	if (!details.open) return;
	details.open = false;
	if (returnFocus) details.querySelector<HTMLElement>('summary')?.focus();
}

interface SettingsState {
	onDocumentClick?: (event: MouseEvent) => void;
}

export const ConsoleSettings: m.Component = {
	oncreate(vnode) {
		const details = vnode.dom as HTMLDetailsElement;
		const state = vnode.state as SettingsState;
		// A click anywhere else closes the popover, like Escape does.
		state.onDocumentClick = (event: MouseEvent) => {
			if (!details.contains(event.target as Node)) closePanel(details, false);
		};
		document.addEventListener('click', state.onDocumentClick);
	},

	onremove(vnode) {
		const { onDocumentClick } = vnode.state as SettingsState;
		if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
	},

	view() {
		const gate = readLessonGate();

		return m(
			'details.console__settings',
			{
				onkeydown: (event: KeyboardEvent) => {
					if (event.key === 'Escape') closePanel(event.currentTarget as HTMLDetailsElement, true);
				},
			},
			[
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
			],
		);
	},
};
