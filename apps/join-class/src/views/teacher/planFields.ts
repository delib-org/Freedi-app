import m from 'mithril';
import { t } from '@/lib/i18n';
import { addNewCard, getFieldError, takeFocus } from './planController';

/**
 * The plan screen's text field, its inline save error and the Enter rule
 * (PlanScreen.ts draws them; planController owns the drafts and saves).
 */

export interface FieldAttrs {
	key: string;
	label: string;
	value: string;
	placeholder: string;
	max: number;
	className: string;
	disabled?: boolean;
	onValue: (value: string) => void;
	onCommit: () => void;
	onEnter?: () => void;
}

/** One always-visible text field that saves on blur. Labelled for screen
 *  readers; the placeholder is a hint, never the label. */
export function field(a: FieldAttrs): m.Vnode {
	return m('input', {
		type: 'text',
		class: a.className,
		value: a.value,
		maxlength: a.max,
		placeholder: a.placeholder,
		disabled: a.disabled,
		'aria-label': a.label,
		'aria-invalid': getFieldError(a.key) ? 'true' : undefined,
		oncreate: (vn: m.VnodeDOM) => {
			if (takeFocus(a.key)) (vn.dom as HTMLInputElement).focus();
		},
		onupdate: (vn: m.VnodeDOM) => {
			if (takeFocus(a.key)) (vn.dom as HTMLInputElement).focus();
		},
		oninput: (e: Event) => a.onValue((e.target as HTMLInputElement).value),
		onblur: a.onCommit,
		onkeydown: (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.isComposing) {
				e.preventDefault();
				if (a.onEnter) a.onEnter();
				else (e.target as HTMLInputElement).blur();
			}
		},
	});
}

export function fieldError(key: string): m.Vnode | null {
	const retry = getFieldError(key);
	if (!retry) return null;

	return m('.plan-card__error', { role: 'alert' }, [
		m('span', t('plan.error.save')),
		m(
			'button.btn.btn--tertiary.btn--small',
			{ type: 'button', onclick: retry },
			t('plan.error.retry'),
		),
	]);
}

export function enterAddsNext(blurTarget: () => void): () => void {
	return () => {
		blurTarget();
		addNewCard();
	};
}
