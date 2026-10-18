import m from 'mithril';
import { t } from '../../lib/i18n';
import { Icon } from '../../components/Icon';
import {
	addChoices,
	addedItem,
	canInsertAt,
	insertionRange,
	matchingPreset,
	planEditorReduce,
	stepProblems,
	type AddChoice,
	type PlanEditorEvent,
} from '../../lib/flows/stagePlanEditor';
import { AddStepSheet } from './planEditor/AddStepSheet';
import { StepEditor } from './planEditor/StepEditor';
import { choiceLabel, choiceOf, choiceTone, stepLine } from './planEditor/stepMeta';
import {
	AgoraStage,
	validateStagePlan,
	type AgoraStagePlanItem,
	type AgoraStagePlanPreset,
	type StagePlanError,
} from '@freedi/shared-types';

export interface StagePlanEditorAttrs {
	items: readonly AgoraStagePlanItem[];
	hasCharacters: boolean;
	/** Items before this index are history (a running game) and render locked */
	frozenCount: number;
	onChange: (items: AgoraStagePlanItem[]) => void;
	/** Offer the templates — only sensible before the game starts */
	showPresets?: boolean;
}

/** Every error key the validator can return, so the parity test covers them */
export const PLAN_ERROR_KEYS: Record<StagePlanError, string> = {
	empty: 'startGame.plan_error_empty',
	too_long: 'startGame.plan_error_too_long',
	must_start_lobby: 'startGame.plan_error_must_start_lobby',
	must_end_results: 'startGame.plan_error_must_end_results',
	ended_not_allowed: 'startGame.plan_error_ended_not_allowed',
	duplicate_item_id: 'startGame.plan_error_duplicate_item_id',
	lobby_only_first: 'startGame.plan_error_lobby_only_first',
	results_only_last: 'startGame.plan_error_results_only_last',
	voting_needs_source: 'startGame.plan_error_voting_needs_source',
	stage_needs_characters: 'startGame.plan_error_stage_needs_characters',
	question_needs_title: 'startGame.plan_error_question_needs_title',
	unknown_stage: 'startGame.plan_error_unknown_stage',
};

const PRESET_LABELS: Record<AgoraStagePlanPreset, string> = {
	wizcol: 'startGame.plan_preset_wizcol',
	scenarioWizcol: 'startGame.plan_preset_scenario_wizcol',
	classic: 'startGame.plan_preset_classic',
	quickDecision: 'startGame.plan_preset_quick',
};

/** The card's name: "My story", "Discussion" — or the question type for a question */
function stepName(item: AgoraStagePlanItem): string {
	return choiceLabel(choiceOf(item));
}

/**
 * The lesson's steps as a list of cards the teacher edits in place
 * (docs/ia/agora-lesson-builder.md). Each card shows its number, its type as
 * a coloured chip and the full words students will read; a toolbar on its
 * own line moves or removes it, and a tap opens its editor underneath. "+"
 * between cards and "Add a step" at the end open a sheet of what can go
 * there. Pure rendering over the `stagePlanEditor` reducer; the parent owns
 * the items.
 */
export function StagePlanEditor(): m.Component<StagePlanEditorAttrs> {
	let openItemId: string | null = null;
	/** The question whose words field should take focus on its next mount */
	let focusItemId: string | null = null;
	/** The splice index the add-step sheet is open for */
	let addAt: number | null = null;
	/** A template tapped over the teacher's own edits, waiting for "replace?" */
	let pendingPreset: AgoraStagePlanPreset | null = null;

	/**
	 * Moving a step re-sorts the list, and a card that teleports makes the
	 * teacher lose their place. FLIP: remember where every card sat, let
	 * Mithril reorder the DOM, put each card back where the eye left it and
	 * release it to slide home. Armed by a move or an add only.
	 *
	 * offsetTop, not getBoundingClientRect: scrolling must not read as motion.
	 */
	const rowTops = new Map<string, number>();
	let flipArmed = false;
	let movedItemId: string | null = null;
	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const glow = (dom: HTMLElement): void => {
		// Drop the glow first and force a reflow, so a card moved twice in a row glows twice
		dom.classList.remove('plan-step--moved');
		void dom.offsetWidth;
		dom.classList.add('plan-step--moved');
	};

	const rememberRow = (dom: HTMLElement, itemId: string): void => {
		rowTops.set(itemId, dom.offsetTop);
		if (itemId === movedItemId && !reducedMotion) glow(dom);
	};

	const flipRow = (dom: HTMLElement, itemId: string, flip: boolean): void => {
		const now = dom.offsetTop;
		const before = rowTops.get(itemId);
		rowTops.set(itemId, now);
		if (!flip || before === undefined || reducedMotion) return;
		const delta = before - now;
		if (Math.abs(delta) < 2) return;
		if (itemId === movedItemId) glow(dom);
		dom.style.transition = 'none';
		dom.style.transform = `translateY(${delta}px)`;
		requestAnimationFrame(() => {
			dom.style.transition = '';
			dom.style.transform = '';
		});
	};

	return {
		view(vnode) {
			const { items, hasCharacters, frozenCount, onChange, showPresets = false } = vnode.attrs;
			const options = { hasCharacters, frozenCount };
			const dispatch = (event: PlanEditorEvent): void => {
				if (event.kind === 'move') {
					flipArmed = true;
					movedItemId = event.itemId;
				}
				onChange(planEditorReduce(items, event, options));
			};
			// Hooks run after this view; they see the value the move armed, and the next render starts clean
			const flip = flipArmed;
			flipArmed = false;
			const errors = validateStagePlan(items, { hasCharacters });
			const problems = stepProblems(items, { hasCharacters });
			const range = insertionRange(items, frozenCount);
			const choices = addChoices(items, { hasCharacters });
			const presets: AgoraStagePlanPreset[] = hasCharacters
				? ['scenarioWizcol', 'classic']
				: ['wizcol', 'quickDecision'];
			const current = showPresets ? matchingPreset(items, presets, frozenCount) : null;

			const addStep = (choice: AddChoice, at: number): void => {
				const next = planEditorReduce(
					items,
					{ kind: 'add', stage: choice.stage, questionKind: choice.questionKind, at },
					options,
				);
				const added = addedItem(items, next);
				addAt = null;
				if (added) {
					flipArmed = true;
					movedItemId = added.itemId;
					// A new question opens straight into its words — a new discussion into its rule
					if (added.stage === AgoraStage.question || added.stage === AgoraStage.deliberation) {
						openItemId = added.itemId;
						focusItemId = added.stage === AgoraStage.question ? added.itemId : null;
					}
				}
				onChange(next);
			};

			const presetRow = (): m.Children =>
				m('.plan-editor__templates', [
					m('span.plan-editor__templates-label', { id: 'plan-templates' }, t('planb.templates')),
					m(
						'.plan-editor__template-chips',
						{ role: 'group', 'aria-labelledby': 'plan-templates' },
						presets.map((preset) =>
							m(
								'button.plan-editor__template',
								{
									key: preset,
									type: 'button',
									'aria-pressed': String(current === preset),
									onclick: () => {
										if (current === preset) return;
										// Untouched: switch freely. Edited: ask before throwing the edits away
										if (current === null) {
											pendingPreset = preset;

											return;
										}
										openItemId = null;
										dispatch({ kind: 'preset', preset });
									},
								},
								[
									current === preset ? m(Icon, { name: 'check', size: 16 }) : null,
									t(PRESET_LABELS[preset]),
								],
							),
						),
					),
					pendingPreset
						? m(
								'.plan-editor__confirm',
								{ role: 'alertdialog', 'aria-labelledby': 'plan-confirm' },
								[
									m('p.plan-editor__confirm-text#plan-confirm', t('planb.replace_ask')),
									m('.plan-editor__confirm-actions', [
										m(
											'button.btn.btn--sm.btn--primary',
											{
												type: 'button',
												oncreate: (node: m.VnodeDOM) => (node.dom as HTMLElement).focus(),
												onclick: () => {
													const preset = pendingPreset;
													pendingPreset = null;
													openItemId = null;
													if (preset) dispatch({ kind: 'preset', preset });
												},
											},
											t('planb.replace_yes'),
										),
										m(
											'button.btn.btn--sm.btn--ghost',
											{ type: 'button', onclick: () => (pendingPreset = null) },
											t('planb.replace_no'),
										),
									]),
								],
							)
						: null,
				]);

			/** The thin "+" between two cards: insert after step `index + 1` */
			const insertPoint = (at: number): m.Children =>
				m(
					'li.plan-editor__insert',
					{ key: `insert-${items[at]?.itemId ?? 'end'}` },
					m(
						'button.plan-editor__insert-btn',
						{
							type: 'button',
							'aria-label': t('planb.add_here', { n: at }),
							onclick: () => (addAt = at),
						},
						m('span.plan-editor__insert-plus', m(Icon, { name: 'plus', size: 16 })),
					),
				);

			const card = (item: AgoraStagePlanItem, index: number): m.Children => {
				const frozen = index < frozenCount;
				const fixed = item.stage === AgoraStage.lobby || item.stage === AgoraStage.results;
				const editable = !frozen && !fixed;
				const hasOptions =
					editable &&
					(item.stage === AgoraStage.question || item.stage === AgoraStage.deliberation);
				const open = hasOptions && openItemId === item.itemId;
				const problem = frozen ? undefined : problems.get(item.itemId);
				const line = stepLine(item);
				const name = stepName(item);
				const n = index + 1;
				const canUp = editable && index - 1 >= Math.max(frozenCount, range.first);
				const canDown = editable && index + 1 < range.last;
				const toggle = (): void => {
					openItemId = open ? null : item.itemId;
				};

				const body = [
					m(
						'span.plan-step__num',
						{ 'aria-hidden': 'true' },
						frozen ? m(Icon, { name: 'check', size: 14 }) : String(n),
					),
					m('span.plan-step__text', [
						m(
							'span.plan-step__chip',
							{ class: `plan-step__chip--${choiceTone(choiceOf(item))}` },
							name,
						),
						m(
							'span.plan-step__line',
							{ class: line.isDefault ? 'plan-step__line--default' : undefined },
							line.text,
						),
						problem ? m('span.plan-step__problem', t(PLAN_ERROR_KEYS[problem])) : null,
					]),
					fixed || frozen
						? m('span.plan-step__pin', [
								m(Icon, { name: 'lock', size: 14 }),
								t(
									frozen
										? 'planb.step_done'
										: item.stage === AgoraStage.lobby
											? 'planb.fixed_first'
											: 'planb.fixed_last',
								),
							])
						: null,
				];

				return m(
					'li.plan-step',
					{
						key: item.itemId,
						oncreate: (node: m.VnodeDOM) => rememberRow(node.dom as HTMLElement, item.itemId),
						onupdate: (node: m.VnodeDOM) => flipRow(node.dom as HTMLElement, item.itemId, flip),
						class:
							[
								fixed ? 'plan-step--fixed' : '',
								frozen ? 'plan-step--frozen' : '',
								open ? 'plan-step--open' : '',
								problem ? 'plan-step--invalid' : '',
							]
								.filter(Boolean)
								.join(' ') || undefined,
					},
					[
						hasOptions
							? m(
									'button.plan-step__main',
									{
										type: 'button',
										'aria-expanded': String(open),
										'aria-label': t('planb.edit_step', { n, name: `${name}, ${line.text}` }),
										onclick: toggle,
									},
									body,
								)
							: m('.plan-step__main', body),
						editable
							? m('.plan-step__tools', [
									hasOptions
										? m(
												'button.plan-step__tool.plan-step__tool--edit',
												{ type: 'button', 'aria-expanded': String(open), onclick: toggle },
												[
													m(Icon, { name: open ? 'check' : 'edit', size: 18 }),
													t(open ? 'planb.done' : 'planb.edit'),
												],
											)
										: null,
									m('span.plan-step__spacer'),
									m(
										'button.plan-step__tool.plan-step__tool--icon',
										{
											type: 'button',
											'aria-label': t('planb.move_up', { n }),
											disabled: !canUp,
											onclick: () => dispatch({ kind: 'move', itemId: item.itemId, direction: -1 }),
										},
										m(Icon, {
											name: 'arrow',
											size: 20,
											class: 'plan-step__arrow plan-step__arrow--up',
										}),
									),
									m(
										'button.plan-step__tool.plan-step__tool--icon',
										{
											type: 'button',
											'aria-label': t('planb.move_down', { n }),
											disabled: !canDown,
											onclick: () => dispatch({ kind: 'move', itemId: item.itemId, direction: 1 }),
										},
										m(Icon, {
											name: 'arrow',
											size: 20,
											class: 'plan-step__arrow plan-step__arrow--down',
										}),
									),
									m(
										'button.plan-step__tool.plan-step__tool--icon.plan-step__tool--remove',
										{
											type: 'button',
											'aria-label': t('planb.remove', { n }),
											onclick: () => {
												if (openItemId === item.itemId) openItemId = null;
												dispatch({ kind: 'remove', itemId: item.itemId });
											},
										},
										m(Icon, { name: 'trash', size: 20 }),
									),
								])
							: null,
						open
							? m(StepEditor, {
									item,
									index: n,
									focusWords: focusItemId === item.itemId,
									onFocused: () => (focusItemId = null),
									onPatch: (patch) => dispatch({ kind: 'patch', itemId: item.itemId, patch }),
									onDone: () => (openItemId = null),
								})
							: null,
					],
				);
			};

			const rows: m.Vnode[] = [];
			items.forEach((item, index) => {
				rows.push(card(item, index) as m.Vnode);
				// A "+" after this card when a step may go there — the end has its own button
				const at = index + 1;
				if (choices.length > 0 && at < range.last && canInsertAt(items, at, frozenCount)) {
					rows.push(insertPoint(at) as m.Vnode);
				}
			});

			const afterIndex = addAt === null ? 0 : addAt - 1;
			const afterItem = items[afterIndex];

			return m('.plan-editor', [
				showPresets ? presetRow() : null,
				m('ol.plan-editor__list', rows),
				choices.length > 0
					? m('button.plan-editor__add', { type: 'button', onclick: () => (addAt = range.last) }, [
							m('span.plan-editor__add-plus', m(Icon, { name: 'plus', size: 18 })),
							t('planb.add'),
						])
					: null,
				errors.length > 0
					? m(
							'ul.plan-editor__errors',
							{ role: 'status' },
							errors.map((error) => m('li', { key: error }, t(PLAN_ERROR_KEYS[error]))),
						)
					: null,
				addAt !== null && afterItem
					? m(AddStepSheet, {
							choices,
							after: { n: afterIndex + 1, name: stepName(afterItem) },
							onPick: (choice) => {
								if (addAt !== null) addStep(choice, addAt);
							},
							onClose: () => (addAt = null),
						})
					: null,
			]);
		},
	};
}
