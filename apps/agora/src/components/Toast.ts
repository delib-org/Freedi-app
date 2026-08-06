import m from 'mithril';
import { t } from '../lib/i18n';
import { getToasts, dismissToast } from '../lib/notifications';
import { requestMineFocus } from '../lib/helpedFocus';

/** Maps notification trigger types to localized toast lines */
function toastText(triggerType: string, fallback: string): string {
	switch (triggerType) {
		case 'agora_suggestion_received':
			return t('toast.suggestion_received');
		case 'agora_suggestion_accepted':
			return t('toast.suggestion_accepted');
		case 'agora_suggestion_declined':
			return t('toast.suggestion_declined');
		case 'agora_suggestion_thanked':
			return t('toast.suggestion_thanked');
		case 'agora_round_started':
			return t('toast.round_started');
		case 'agora_helped_improved':
			return t('toast.helped_improved');
		default:
			return fallback;
	}
}

/** Floating lantern-glow toast stack (top of the game shell) */
export const ToastStack: m.Component = {
	view() {
		const toasts = getToasts();
		if (toasts.length === 0) return null;

		return m(
			'.toast-stack',
			toasts.map((toast) =>
				m(
					'.toast',
					{
						key: toast.notificationId,
						// "Feedback is waiting in your workshop" must TAKE you there —
						// a toast that only points is half a notification
						class: toast.triggerType === 'agora_suggestion_received' ? 'toast--action' : undefined,
						onclick: () => {
							if (toast.triggerType === 'agora_suggestion_received') requestMineFocus();
							dismissToast(toast.notificationId);
						},
						role: 'status',
					},
					[m('span.toast__glow'), m('span.toast__text', toastText(toast.triggerType, toast.text))],
				),
			),
		);
	},
};
