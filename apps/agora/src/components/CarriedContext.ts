import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { Collapsible } from './Collapsible';
import { CpBands } from './CpBands';
import { planItemLabel } from './StageNav';
import {
	closedQuestionItems,
	roundLikes,
	roundSpecOf,
	type AgoraCarriedAnswer,
	type AgoraRoundSpec,
	type AgoraSession,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

export interface CarriedContextAttrs {
	session: AgoraSession;
	/** Only questions and rounds closed BEFORE this plan position are shown */
	beforeIndex: number;
	defaultOpen?: boolean;
}

/** A round's text in the folded "all N" list: hearts for a story, nothing else */
function roundRow(spec: AgoraRoundSpec, row: AgoraCarriedAnswer): m.Children {
	const hearts = spec.scale === 'like' ? roundLikes(row) : 0;

	return m('li.carried__answer', { key: row.statementId }, [
		row.statement,
		hearts > 0 ? m('span.carried__hearts', { 'aria-hidden': 'true' }, ` ♥${hearts}`) : null,
	]);
}

/**
 * What the room said in the stages before this one — a question's overall
 * line and its answers banded by C_p; a round's record (the class's stories
 * in one paragraph, the needs list, the merged vision) with every text
 * folded under it — carried into every later screen, so the work a stage
 * produced is never something a player has to leave the stage to find.
 * Renders nothing when there is nothing carried.
 */
export function CarriedContext(
	initialVnode: m.Vnode<CarriedContextAttrs>,
): m.Component<CarriedContextAttrs> {
	let open = initialVnode.attrs.defaultOpen ?? true;
	const unfolded = new Set<string>();

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
						// The fold is a chevron, not a word: "Hide" next to a title
						// that already says what the card is spent a line saying
						// what one turned triangle says. Screen readers still get
						// the verb, which is the half that was carrying meaning.
						'aria-label': t(open ? 'carried.hide' : 'carried.show'),
					},
					[
						m('span.carried__icon', { 'aria-hidden': 'true' }, m(Icon, { name: 'talk', size: 18 })),
						m('span.carried__title', t('carried.title')),
						m('span.carried__fold', { 'aria-hidden': 'true' }),
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

									const spec = roundSpecOf(item);
									if (spec) {
										const showAll = unfolded.has(item.itemId);

										return m('.carried__item.carried__item--round', { key: item.itemId }, [
											m('p.carried__from', t('carried.from', { title: planItemLabel(item) })),
											outcome.summary ? m('p.carried__summary', outcome.summary) : null,
											outcome.selected.length > 0
												? [
														m(
															'button.carried__all',
															{
																type: 'button',
																'aria-expanded': String(showAll),
																onclick: () => {
																	if (showAll) unfolded.delete(item.itemId);
																	else unfolded.add(item.itemId);
																},
															},
															t(showAll ? 'carried.fold_all' : 'carried.all_n', {
																n: outcome.selected.length,
															}),
														),
														showAll
															? m(
																	Collapsible,
																	m(
																		'ol.carried__answers',
																		outcome.selected.map((row) => roundRow(spec, row)),
																	),
																)
															: null,
													]
												: null,
										]);
									}

									return m('.carried__item', { key: item.itemId }, [
										m('p.carried__from', t('carried.from', { title: item.title ?? '' })),
										outcome.summary ? m('p.carried__summary', outcome.summary) : null,
										outcome.selected.length > 0
											? m(CpBands, {
													answers: outcome.selected,
													bands: outcome.bands,
													brief: true,
												})
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
