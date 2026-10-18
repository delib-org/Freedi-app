import m from 'mithril';
import { Icon } from './Icon';
import { Collapsible } from './Collapsible';
import { t } from '../lib/i18n';

/**
 * The shared "explain" pattern: a small round i that opens a short body.
 *
 * Whatever a student does NOT need in order to take the next step lives
 * behind it, so the working screen carries one instruction and the reason
 * is one tap away. The body is never allowed to hold a step the student
 * must take, and stays at 15 words or fewer.
 *
 * The body is announced when the button is activated (aria-expanded on the
 * button + aria-controls), not when it receives focus.
 */
export interface ExplainHintAttrs {
	/** The body, already translated */
	text: m.Children;
	/** Extra class on the wrapper, for placement */
	class?: string;
}

let nextId = 0;

export function ExplainHint(): m.Component<ExplainHintAttrs> {
	let open = false;
	nextId += 1;
	const bodyId = `explain-hint-${nextId}`;

	return {
		view({ attrs }) {
			return m('.explain-hint', { class: attrs.class }, [
				m(
					'button.explain-hint__button',
					{
						type: 'button',
						'aria-expanded': open ? 'true' : 'false',
						'aria-controls': bodyId,
						'aria-label': t('explain.label'),
						onclick: () => {
							open = !open;
						},
					},
					m(Icon, { name: 'info', size: 20 }),
				),
				open
					? m(Collapsible, [m('.explain-hint__body', { id: bodyId, role: 'note' }, attrs.text)])
					: null,
			]);
		},
	};
}
