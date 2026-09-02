import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { Collapsible } from './Collapsible';
import {
	closedQuestionItems,
	type AgoraSession,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

export interface CarriedContextAttrs {
	session: AgoraSession;
	/** Only questions closed BEFORE this plan position are shown */
	beforeIndex: number;
	defaultOpen?: boolean;
}

/**
 * What the room said in the question stages before this one — the selected
 * answers and the summary — folded into every later screen, so the work a
 * stage produced is never something a player has to leave the stage to find.
 * Renders nothing when there is nothing carried.
 */
export function CarriedContext(
	initialVnode: m.Vnode<CarriedContextAttrs>,
): m.Component<CarriedContextAttrs> {
	let open = initialVnode.attrs.defaultOpen ?? true;

	return {
		view(vnode) {
			const { session, beforeIndex } = vnode.attrs;
			const stageState = session.stageState ?? {};
			const items: AgoraStagePlanItem[] = closedQuestionItems(session, beforeIndex).filter(
				(item) => stageState[item.itemId]?.outcome !== undefined,
			);
			if (items.length === 0) return null;

			return m('.carried', { class: open ? 'carried--open' : undefined }, [
				m(
					'button.carried__toggle',
					{
						type: 'button',
						onclick: () => {
							open = !open;
						},
						'aria-expanded': String(open),
					},
					[
						m('span.carried__icon', { 'aria-hidden': 'true' }, m(Icon, { name: 'talk', size: 18 })),
						m('span.carried__title', t('carried.title')),
						m('span.carried__fold', t(open ? 'carried.hide' : 'carried.show')),
					],
				),
				open
					? m(
							Collapsible,
							m(
								'.carried__list',
								items.map((item) => {
									const outcome = stageState[item.itemId]?.outcome;
									if (!outcome) return null;

									return m('.carried__item', { key: item.itemId }, [
										m('p.carried__from', t('carried.from', { title: item.title ?? '' })),
										outcome.summary ? m('p.carried__summary', outcome.summary) : null,
										outcome.selected.length > 0
											? m(
													'ul.carried__answers',
													outcome.selected.map((answer) =>
														m('li.carried__answer', { key: answer.statementId }, [
															answer.anonName ? m('span.carried__who', answer.anonName) : null,
															m('span.carried__text', answer.statement),
														]),
													),
												)
											: null,
									]);
								}),
							),
						)
					: null,
			]);
		},
	};
}
