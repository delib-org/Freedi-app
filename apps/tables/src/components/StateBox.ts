import m from 'mithril';
import { t } from '@/lib/i18n';

/**
 * Loading / error / no-permission / empty (IA section 7). One component so
 * every screen words these states the same way.
 */
export type StateKind = 'loading' | 'error' | 'denied' | 'empty';

export interface StateBoxAttrs {
	kind: StateKind;
	/** Overrides the default message of the kind. */
	messageKey?: string;
	onRetry?: () => void;
	backHref?: string;
	backLabel?: string;
	/** An action for the empty state, e.g. "create the first one". */
	action?: m.Children;
}

const DEFAULT_MESSAGE: Record<StateKind, string> = {
	loading: 'tableAssignment.state.loading',
	error: 'tableAssignment.state.error',
	denied: 'tableAssignment.state.denied',
	empty: 'tableAssignment.state.empty',
};

export const StateBox: m.Component<StateBoxAttrs> = {
	view({ attrs }) {
		const message = t(attrs.messageKey ?? DEFAULT_MESSAGE[attrs.kind]);
		const live = attrs.kind === 'error' || attrs.kind === 'denied' ? 'alert' : 'status';

		return m(`.state-box.state-box--${attrs.kind}`, { role: live }, [
			attrs.kind === 'loading' ? m('span.state-box__spinner', { 'aria-hidden': 'true' }) : null,
			m('p.state-box__message', message),
			attrs.action ?? null,
			attrs.onRetry && attrs.kind === 'error'
				? m(
						'button.btn.btn--secondary',
						{ type: 'button', onclick: attrs.onRetry },
						t('tableAssignment.retry'),
					)
				: null,
			attrs.backHref
				? m(
						m.route.Link,
						{ href: attrs.backHref, class: 'btn btn--ghost' },
						attrs.backLabel ?? t('tableAssignment.back'),
					)
				: null,
		]);
	},
};
