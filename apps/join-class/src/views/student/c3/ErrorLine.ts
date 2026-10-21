import m from 'mithril';
import { t } from '@/lib/i18n';

export interface ErrorLineAttrs {
	/** Translated message; the line is not drawn when empty. */
	message: string | null;
	onRetry?: () => void;
}

/** Inline error + retry (a callable that fails never crashes a screen). */
export const ErrorLine: m.Component<ErrorLineAttrs> = {
	view({ attrs }) {
		if (!attrs.message) return null;

		return m('p.c3-error', { role: 'alert' }, [
			m('span.c3-error__text', attrs.message),
			attrs.onRetry
				? m(
						'button.btn.btn--small.btn--secondary.c3-error__retry',
						{ type: 'button', onclick: attrs.onRetry },
						t('turn.retry'),
					)
				: null,
		]);
	},
};
