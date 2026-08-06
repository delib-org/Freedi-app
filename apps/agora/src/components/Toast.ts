import m from 'mithril';
import { t } from '../lib/i18n';
import { getToasts, dismissToast, holdToast, releaseToast } from '../lib/notifications';
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
		case 'agora_class_record':
			return t('toast.class_record');
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
			toasts.map((toast) => {
				// "Feedback is waiting in your workshop" must TAKE you there — a
				// toast that only points is half a notification. An actionable
				// toast is therefore a real button: focusable, Enter/Space work,
				// and hovering or focusing it holds the auto-dismiss so a
				// keyboard or switch user can actually reach the action in time.
				const actionable = toast.triggerType === 'agora_suggestion_received';
				const label = toastText(toast.triggerType, toast.text);

				return m(
					actionable ? 'button.toast.toast--action' : '.toast',
					{
						key: toast.notificationId,
						onclick: () => {
							if (actionable) requestMineFocus();
							dismissToast(toast.notificationId);
						},
						onmouseenter: actionable ? () => holdToast(toast.notificationId) : undefined,
						onmouseleave: actionable ? () => releaseToast(toast.notificationId) : undefined,
						onfocus: actionable ? () => holdToast(toast.notificationId) : undefined,
						onblur: actionable ? () => releaseToast(toast.notificationId) : undefined,
						role: actionable ? undefined : 'status',
						'aria-label': actionable ? label : undefined,
					},
					[m('span.toast__glow', { 'aria-hidden': 'true' }), m('span.toast__text', label)],
				);
			}),
		);
	},
};
