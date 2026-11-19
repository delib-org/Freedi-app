import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import '@/styles/console-support-panel.scss';
import { t } from '@/lib/i18n';
import { gateOf, sideNamesOf } from '@/lib/classroom/classSettings';
import { SupportBySide } from '@/views/student/c3/SupportBySide';
import { retrySupport, supportForScreen } from '@/lib/classroom/registrationSupport';

export interface SupportPanelAttrs {
	main: Statement;
	challenge: Statement | null;
	/** The class already sees these bars (results open and support shared). */
	shownToClass: boolean;
}

/**
 * The Summary step's support by side on the teacher's own screen: always
 * visible to her, so she can decide whether to share it with the class
 * (Trello 89fevjY5). Same bars and sentence as the phones and the projector.
 */
export const SupportPanel: m.Component<SupportPanelAttrs> = {
	view({ attrs }) {
		const { main, challenge, shownToClass } = attrs;
		const gate = gateOf(challenge, main);
		// The totals come from the server: the sides are private (a registration's poles name them when it asked a position).
		const registered = supportForScreen(main, main.statementId);
		const names = (registered.kind === 'ready' && registered.names) || sideNamesOf(main);

		return m('section.support-panel', { 'data-testid': 'support-panel' }, [
			m('h2.support-panel__title', t('summary.by_side')),
			m(
				'p.support-panel__note',
				{ 'data-testid': 'support-panel-note' },
				t(shownToClass ? 'console.support_panel_shared' : 'console.support_panel_private'),
			),
			registered.kind === 'loading'
				? m('p.support-panel__note', { role: 'status' }, t('plan.loading'))
				: null,
			registered.kind === 'failed'
				? m('p.support-panel__note', { role: 'alert' }, [
						t('console.support_registration_failed'),
						' ',
						m(
							'button.btn.btn--tertiary',
							{ type: 'button', onclick: () => retrySupport(main, main.statementId) },
							t('console.retry'),
						),
					])
				: null,
			registered.kind === 'ready'
				? m(SupportBySide, { result: registered.result, gate, names })
				: null,
		]);
	},
};
