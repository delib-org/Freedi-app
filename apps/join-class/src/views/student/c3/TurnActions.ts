import m from 'mithril';
import { t } from '@/lib/i18n';

/** One button of the Table talk footer. */
export interface TurnButton {
	label: string;
	testId: string;
	disabled?: boolean;
	/** Looks dimmed but stays tappable (it explains itself when tapped). */
	dimmed?: boolean;
	/** id of the line that explains a dimmed button. */
	describedBy?: string;
	onclick: () => void;
}

/** The inline confirm that follows the secondary button (pass asking). */
export interface TurnConfirm {
	text: string;
	yesLabel: string;
	onYes: () => void;
	yesTestId: string;
	cancelTestId: string;
}

export interface TurnActionsAttrs {
	primary: TurnButton;
	secondary?: TurnButton;
	/** When set, the secondary opens this confirm instead of acting. */
	confirm?: TurnConfirm;
	/** Changes when the table's step, turn or state changes: an open confirm closes by itself. */
	resetKey: string;
	busy: boolean;
	/** A quiet line under the buttons (not an error). */
	hint?: { id: string; text: string } | null;
	/** Error line + retry, directly under the buttons. */
	below?: m.Children;
}

class ActionsState {
	confirming = false;
	key = '';
}

function primaryButton(button: TurnButton, onTap: () => void): m.Vnode {
	return m(
		'button.btn.btn--primary.turn-actions__primary',
		{
			type: 'button',
			'data-testid': button.testId,
			disabled: button.disabled ? true : undefined,
			'aria-disabled': button.dimmed ? 'true' : undefined,
			'aria-describedby': button.describedBy,
			class: button.dimmed ? 'turn-actions__primary--dimmed' : '',
			onclick: () => {
				onTap();
				button.onclick();
			},
		},
		button.label,
	);
}

function confirmRow(
	confirm: TurnConfirm,
	busy: boolean,
	close: () => void,
	pass: () => void,
): m.Vnode {
	return m('.turn-actions__confirm', { role: 'group' }, [
		m('p.turn-actions__ask', confirm.text),
		m(
			'button.btn.btn--text.turn-actions__no',
			{
				type: 'button',
				'data-testid': confirm.cancelTestId,
				oncreate: (node: m.VnodeDOM) => (node.dom as HTMLButtonElement).focus(),
				onkeydown: (event: KeyboardEvent) => {
					if (event.key === 'Escape') close();
				},
				onclick: close,
			},
			t('common.cancel'),
		),
		m(
			'button.btn.btn--secondary.btn--small.turn-actions__yes',
			{
				type: 'button',
				'data-testid': confirm.yesTestId,
				disabled: busy,
				onclick: () => {
					close();
					pass();
				},
			},
			confirm.yesLabel,
		),
	]);
}

/**
 * The footer of the Table talk screens that act (P1 and A): one primary control
 * and one real secondary button under it, never hidden, never filled. The
 * secondary may carry ONE inline confirm (it costs a student the whole lesson:
 * pass asking); the primary stays enabled while it is open and a tap on it closes
 * the confirm. Props in, vnodes out.
 */
export const TurnActions: m.ClassComponent<TurnActionsAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: ActionsState }).self = new ActionsState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: ActionsState }).self as ActionsState;
		const { primary, secondary, confirm, resetKey, busy, hint, below } = vnode.attrs;
		if (self.key !== resetKey) {
			self.key = resetKey;
			self.confirming = false;
		}
		const close = (): void => {
			self.confirming = false;
		};
		const confirming = !!confirm && self.confirming;

		return m('.turn-actions', [
			primaryButton(primary, close),
			hint ? m('p.turn-actions__hint', { id: hint.id }, hint.text) : null,
			secondary && confirm && confirming
				? confirmRow(confirm, busy, close, confirm.onYes)
				: secondary
					? m(
							'button.btn.btn--secondary.turn-actions__secondary',
							{
								type: 'button',
								'data-testid': secondary.testId,
								disabled: secondary.disabled ? true : undefined,
								onclick: () => {
									if (confirm) self.confirming = true;
									else secondary.onclick();
								},
							},
							secondary.label,
						)
					: null,
			below ?? null,
		]);
	},
};
