import m from 'mithril';
import { t } from '@/lib/i18n';
import type { MoveOnView } from '@/lib/classroom/moveOn';

export interface MoveOnAttrs {
	view: MoveOnView;
	busy: boolean;
	onToggle: () => void;
}

/**
 * "Move on" (the table moves without the teacher when enough tablemates tap): a
 * quiet text button that toggles my press, and "N/2 want to move on" once anyone did.
 * Props in, vnodes out.
 */
export const MoveOn: m.ClassComponent<MoveOnAttrs> = {
	view(vnode) {
		const { view, busy, onToggle } = vnode.attrs;

		return m('.move-on', [
			view.count > 0
				? m(
						'p.move-on__count',
						{ 'data-testid': 'move-on-count', role: 'status' },
						t('turn.move_on_count', { n: view.count, needed: view.needed }),
					)
				: null,
			m(
				'button.btn.btn--text.move-on__button',
				{
					type: 'button',
					'data-testid': 'move-on',
					'aria-pressed': view.pressed ? 'true' : 'false',
					disabled: busy,
					onclick: onToggle,
				},
				view.pressed ? t('turn.move_on_withdraw') : t('turn.move_on'),
			),
		]);
	},
};
