import m from 'mithril';
import { t } from '@/lib/i18n';
import type { ConsoleView } from './consoleState';

/**
 * The view switch (design 1.3): "Tables | What they wrote", the unseen-flags count on the
 * second one. Everything the step does moved to the action band; the students' screen moved
 * to "More".
 */

export interface SwitchBandAttrs {
	view: ConsoleView;
	/** Unseen language flags (IA 24.4): a count on the "what they wrote" switch. */
	flagCount?: number;
	onView: (view: ConsoleView) => void;
}

function segment(attrs: SwitchBandAttrs): m.Vnode {
	const item = (view: ConsoleView, labelKey: string): m.Vnode =>
		m(
			'button.switch-band__segment-btn',
			{
				type: 'button',
				'data-view': view,
				'aria-pressed': attrs.view === view ? 'true' : 'false',
				class: attrs.view === view ? 'switch-band__segment-btn--on' : '',
				onclick: () => attrs.onView(view),
			},
			[
				t(labelKey),
				view === 'texts' && (attrs.flagCount ?? 0) > 0
					? m('span.switch-band__badge', { 'data-testid': 'flags-badge' }, String(attrs.flagCount))
					: null,
			],
		);

	return m('div.switch-band__segment', { role: 'group', 'aria-label': t('console.view_label') }, [
		item('tables', 'console.tables'),
		item('texts', 'console.texts'),
	]);
}

export const SwitchBand: m.Component<SwitchBandAttrs> = {
	view({ attrs }) {
		return m('div.switch-band', segment(attrs));
	},
};
