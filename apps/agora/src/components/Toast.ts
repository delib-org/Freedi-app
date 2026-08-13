import m from 'mithril';
import { getToasts, dismissToast, holdToast, releaseToast } from '../lib/notifications';
import { requestFocus } from '../lib/helpedFocus';
import { triggerLook } from '../lib/notificationCopy';

/** Floating lantern-glow toast stack (top of the game shell) */
export const ToastStack: m.Component = {
	view() {
		const toasts = getToasts();
		if (toasts.length === 0) return null;

		return m(
			'.toast-stack',
			toasts.map((toast) => {
				// A toast that only points is half a notification: every one that
				// knows WHERE its news lives is a real button — focusable,
				// Enter/Space work, and hovering or focusing it holds the
				// auto-dismiss so a keyboard or switch user can reach it in time.
				// The target rides on the toast itself now, so this and the inbox
				// row for the same event can never lead to different places.
				const target = toast.target;
				const actionable = target !== undefined;
				const label = triggerLook(toast.triggerType, toast.text).line;

				return m(
					actionable ? 'button.toast.toast--action' : '.toast',
					{
						key: toast.notificationId,
						onclick: () => {
							if (target) requestFocus(target);
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
