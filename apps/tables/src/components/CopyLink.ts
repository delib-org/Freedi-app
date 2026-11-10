import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { t } from '@/lib/i18n';

const COPIED_RESET_MS = 2_000;

export interface CopyLinkAttrs {
	url: string;
}

/** Copies the participant link; says so when the browser refuses. */
export const CopyLink: m.ClosureComponent<CopyLinkAttrs> = () => {
	let copied = false;
	let copyFailed = false;

	async function copy(url: string): Promise<void> {
		copyFailed = false;

		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => {
				copied = false;
				m.redraw();
			}, COPIED_RESET_MS);
		} catch (error) {
			logError(error, { operation: 'tables.copyLink.copy' });
			copyFailed = true;
		}
		m.redraw();
	}

	return {
		view({ attrs }) {
			return [
				m(
					'button.btn.btn--outline',
					{ type: 'button', onclick: () => void copy(attrs.url) },
					t(copied ? 'tableAssignment.link.copied' : 'tableAssignment.link.copy'),
				),
				copyFailed
					? m('p.notice.notice--error', { role: 'alert' }, t('tableAssignment.link.copyFailed'))
					: null,
			];
		},
	};
};
