import m from 'mithril';
import '@/styles/teacher-threads.scss';
import { t } from '@/lib/i18n';
import { setHidden } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * The one hide / restore control of "מה כתבו" (IA 24.2), the same for answers,
 * a table's own question, proposals and replies: a real button with an eye icon
 * and a label that says what it does, "Hide from students" or "Show to
 * students again". Always undoable, so no confirm. The state itself is shown by
 * the `console.hidden_flag` chip beside the item, never by this button alone.
 */

export interface HideControlAttrs {
	statementId: string;
	hidden: boolean;
	testId?: string;
	small?: boolean;
}

const SVG_ATTRS = {
	viewBox: '0 0 24 24',
	width: '18',
	height: '18',
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
	'aria-hidden': 'true',
	focusable: 'false',
};

/** An open eye: shown on "Show to students again". */
function eye(): m.Vnode {
	return m('svg.hide-control__icon', SVG_ATTRS, [
		m('path', { d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z' }),
		m('circle', { cx: '12', cy: '12', r: '3' }),
	]);
}

/** A crossed eye: shown on "Hide from students". */
function eyeOff(): m.Vnode {
	return m('svg.hide-control__icon', SVG_ATTRS, [
		m('path', {
			d: 'M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.77 19.77 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a19.86 19.86 0 0 1-3.17 4.19M14.12 14.12a3 3 0 1 1-4.24-4.24',
		}),
		m('line', { x1: '1', y1: '1', x2: '23', y2: '23' }),
	]);
}

export const HideControl: m.Component<HideControlAttrs> = {
	view({ attrs }) {
		const { statementId, hidden } = attrs;

		return m(
			'button.btn.btn--tertiary.hide-control',
			{
				type: 'button',
				class: attrs.small ? 'btn--small' : '',
				'data-testid': attrs.testId ?? 'hide-control',
				disabled: isBusy(`hide:${statementId}`),
				onclick: () => void setHidden(statementId, !hidden),
			},
			[hidden ? eye() : eyeOff(), m('span', t(hidden ? 'console.restore' : 'console.hide'))],
		);
	},
};
