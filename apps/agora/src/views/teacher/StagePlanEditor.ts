import m from 'mithril';
import { t } from '../../lib/i18n';
import { Icon } from '../../components/Icon';
import { planItemLabel } from '../../components/StageNav';
import {
	addableStages,
	planEditorReduce,
	type PlanEditorEvent,
} from '../../lib/flows/stagePlanEditor';
import {
	AgoraStage,
	CutoffBy,
	AGORA_STAGE_PLAN,
	defaultQuestionSelection,
	defaultVotingTrigger,
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
	/** Offer the presets — only sensible before the game starts */
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

/**
 * The ordered stage list, as a list the admin edits in place: add a stage,
 * move it, remove it, and open the per-stage options — a question's text and
 * cutoff, a deliberation's auto-vote rule. Pure rendering over the
 * `stagePlanEditor` reducer; the parent owns the items.
 */
export function StagePlanEditor(): m.Component<StagePlanEditorAttrs> {
	let openItemId: string | null = null;
	/** The question whose title input should take focus on its next mount */
	let focusItemId: string | null = null;
	let addOpen = false;

	/** The select's plain values → the shared enum; anything unknown is the default */
	const cutoffFromSelectValue = (value: string): CutoffBy => {
		if (value === 'threshold') return CutoffBy.aboveThreshold;
		if (value === 'all') return CutoffBy.all;

		return CutoffBy.topOptions;
	};

	const openForTyping = (itemId: string): void => {
		openItemId = itemId;
		focusItemId = itemId;
	};

	return {
		view(vnode) {
			const { items, hasCharacters, frozenCount, onChange, showPresets = false } = vnode.attrs;
			const options = { hasCharacters, frozenCount };
			const dispatch = (event: PlanEditorEvent): void =>
				onChange(planEditorReduce(items, event, options));
			const errors = validateStagePlan(items, { hasCharacters });
			const addable = addableStages(items, { hasCharacters });

			const numberInput = (
				value: number,
				attrs: { min: string; max: string; step: string },
				onchange: (next: number) => void,
			): m.Children =>
				m('input.plan-editor__number[type=number]', {
					value,
					...attrs,
					onchange: (event: Event) => onchange(Number((event.target as HTMLInputElement).value)),
				});

			const questionOptions = (item: AgoraStagePlanItem): m.Children => {
				const selection = item.selection ?? defaultQuestionSelection();
				const byThreshold = selection.cutoffBy === CutoffBy.aboveThreshold;
				const byAll = selection.cutoffBy === CutoffBy.all;

				return m('.plan-editor__options', [
					m('label.plan-editor__field', [
						m('span', t('startGame.plan_question_title')),
						m('input.plan-editor__text[type=text]', {
							value: item.title ?? '',
							maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
							placeholder: t('startGame.quick_question_ph'),
							oncreate: (node: m.VnodeDOM) => {
								if (focusItemId !== item.itemId) return;
								focusItemId = null;
								(node.dom as HTMLInputElement).focus();
							},
							oninput: (event: InputEvent) =>
								dispatch({
									kind: 'patch',
									itemId: item.itemId,
									patch: { title: (event.target as HTMLInputElement).value },
								}),
						}),
					]),
					m('label.plan-editor__field', [
						m('span', t('startGame.plan_question_explanation')),
						m('textarea.plan-editor__textarea', {
							value: item.explanation ?? '',
							rows: 2,
							maxlength: AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
							oninput: (event: InputEvent) =>
								dispatch({
									kind: 'patch',
									itemId: item.itemId,
									patch: { explanation: (event.target as HTMLTextAreaElement).value },
								}),
						}),
					]),
					m('.plan-editor__row', [
						m('span', t('startGame.plan_cutoff')),
						m(
							'select.plan-editor__select',
							{
								onchange: (event: Event) =>
									dispatch({
										kind: 'patch',
										itemId: item.itemId,
										patch: {
											selection: {
												...selection,
												cutoffBy: cutoffFromSelectValue(
													(event.target as HTMLSelectElement).value,
												),
											},
										},
									}),
							},
							[
								m(
									'option',
									{ value: 'top', selected: !byThreshold && !byAll },
									t('startGame.plan_cutoff_top'),
								),
								m(
									'option',
									{ value: 'threshold', selected: byThreshold },
									t('startGame.plan_cutoff_threshold'),
								),
								m(
									'option',
									{ value: 'all', selected: byAll },
									t('startGame.plan_cutoff_all'),
								),
							],
						),
						byAll
							? null
							: byThreshold
							? [
									m('span', t('startGame.plan_cutoff_min')),
									numberInput(
										selection.cutoffNumber,
										{ min: '-1', max: '1', step: '0.05' },
										(next) =>
											dispatch({
												kind: 'patch',
												itemId: item.itemId,
												patch: { selection: { ...selection, cutoffNumber: next } },
											}),
									),
								]
							: [
									m('span', t('startGame.plan_cutoff_n')),
									numberInput(
										selection.numberOfResults,
										{ min: '1', max: '10', step: '1' },
										(next) =>
											dispatch({
												kind: 'patch',
												itemId: item.itemId,
												patch: { selection: { ...selection, numberOfResults: next } },
											}),
									),
								],
					]),
				]);
			};

			const deliberationOptions = (item: AgoraStagePlanItem): m.Children => {
				const rule = item.votingTrigger ?? { ...defaultVotingTrigger(), enabled: false };
				const patchRule = (next: Partial<typeof rule>): void =>
					dispatch({
						kind: 'patch',
						itemId: item.itemId,
						patch: { votingTrigger: { ...rule, ...next } },
					});

				return m('.plan-editor__options', [
					m('label.plan-editor__row', [
						m('input[type=checkbox]', {
							checked: rule.enabled,
							onchange: (event: Event) =>
								patchRule({ enabled: (event.target as HTMLInputElement).checked }),
						}),
						m('span', t('startGame.plan_trigger')),
					]),
					rule.enabled
						? [
								m('.plan-editor__row', [
									m('span', t('startGame.plan_trigger_single')),
									numberInput(rule.singleMin, { min: '-1', max: '1', step: '0.05' }, (next) =>
										patchRule({ singleMin: next }),
									),
								]),
								m('.plan-editor__row', [
									m('span', t('startGame.plan_trigger_pair')),
									numberInput(rule.pairMin, { min: '-1', max: '1', step: '0.05' }, (next) =>
										patchRule({ pairMin: next }),
									),
								]),
								m('.plan-editor__row', [
									m('span', t('startGame.plan_trigger_min_raters')),
									numberInput(rule.minRaters, { min: '1', max: '50', step: '1' }, (next) =>
										patchRule({ minRaters: next }),
									),
								]),
								m('p.plan-editor__hint', t('startGame.plan_trigger_hint')),
							]
						: null,
				]);
			};

			return m('.plan-editor', [
				showPresets
					? m('.plan-editor__presets', [
							m('span.plan-editor__presets-label', t('startGame.plan_presets')),
							(['quickDecision', 'classic'] as AgoraStagePlanPreset[])
								.filter((preset) => preset !== 'classic' || hasCharacters)
								.map((preset) =>
									m(
										'button.btn.btn--sm.btn--secondary',
										{ type: 'button', onclick: () => dispatch({ kind: 'preset', preset }) },
										t(
											preset === 'classic'
												? 'startGame.plan_preset_classic'
												: 'startGame.plan_preset_quick',
										),
									),
								),
						])
					: null,

				m(
					'ol.plan-editor__list',
					items.map((item, index) => {
						const frozen = index < frozenCount;
						const fixed = item.stage === AgoraStage.lobby || item.stage === AgoraStage.results;
						const hasOptions =
							item.stage === AgoraStage.question || item.stage === AgoraStage.deliberation;
						const open = openItemId === item.itemId;
						const untitled = item.stage === AgoraStage.question && !(item.title ?? '').trim();

						return m(
							'li.plan-editor__item',
							{
								key: item.itemId,
								class:
									[
										frozen ? 'plan-editor__item--frozen' : '',
										open ? 'plan-editor__item--open' : '',
										untitled ? 'plan-editor__item--invalid' : '',
									]
										.join(' ')
										.trim() || undefined,
							},
							[
								m('.plan-editor__head', [
									m('span.plan-editor__index', String(index + 1)),
									m('span.plan-editor__name', [
										m('span.plan-editor__kind', t(`stage.${item.stage}`)),
										item.stage !== AgoraStage.question
											? null
											: frozen
												? m('span.plan-editor__title', planItemLabel(item))
												: m(
														'button.plan-editor__title.plan-editor__title--editable',
														{
															type: 'button',
															'aria-label': t('startGame.plan_question_title'),
															'aria-expanded': String(open),
															onclick: () => openForTyping(item.itemId),
														},
														untitled ? t('startGame.plan_untitled') : planItemLabel(item),
													),
									]),
									frozen
										? m(
												'span.plan-editor__lock',
												{ 'aria-hidden': 'true' },
												m(Icon, { name: 'check', size: 14 }),
											)
										: m('.plan-editor__actions', [
												hasOptions
													? m(
															'button.btn.btn--sm.btn--ghost',
															{
																type: 'button',
																'aria-expanded': String(open),
																onclick: () => {
																	openItemId = open ? null : item.itemId;
																},
															},
															t(open ? 'startGame.plan_options_hide' : 'startGame.plan_options'),
														)
													: null,
												fixed
													? null
													: [
															m(
																'button.btn.btn--sm.btn--ghost',
																{
																	type: 'button',
																	'aria-label': t('startGame.plan_up'),
																	disabled: index - 1 < frozenCount || index - 1 <= 0,
																	onclick: () =>
																		dispatch({ kind: 'move', itemId: item.itemId, direction: -1 }),
																},
																'↑',
															),
															m(
																'button.btn.btn--sm.btn--ghost',
																{
																	type: 'button',
																	'aria-label': t('startGame.plan_down'),
																	disabled: index + 1 >= items.length - 1,
																	onclick: () =>
																		dispatch({ kind: 'move', itemId: item.itemId, direction: 1 }),
																},
																'↓',
															),
															m(
																'button.btn.btn--sm.btn--ghost.plan-editor__remove',
																{
																	type: 'button',
																	'aria-label': t('startGame.plan_remove'),
																	onclick: () => dispatch({ kind: 'remove', itemId: item.itemId }),
																},
																'✕',
															),
														],
											]),
								]),
								open && !frozen && item.stage === AgoraStage.question
									? questionOptions(item)
									: null,
								open && !frozen && item.stage === AgoraStage.deliberation
									? deliberationOptions(item)
									: null,
							],
						);
					}),
				),

				addable.length > 0
					? m('.plan-editor__add', [
							m(
								'button.btn.btn--sm.btn--secondary',
								{
									type: 'button',
									'aria-expanded': String(addOpen),
									onclick: () => {
										addOpen = !addOpen;
									},
								},
								`+ ${t('startGame.plan_add')}`,
							),
							addOpen
								? m(
										'.plan-editor__add-menu',
										addable.map((stage) =>
											m(
												'button.btn.btn--sm.btn--ghost',
												{
													key: stage,
													type: 'button',
													onclick: () => {
														const before = new Set(items.map((item) => item.itemId));
														const next = planEditorReduce(items, { kind: 'add', stage }, options);
														addOpen = false;
														// A new question opens straight into its title — there is nothing to do with it until it has one
														const added = next.find((item) => !before.has(item.itemId));
														if (added && stage === AgoraStage.question) openForTyping(added.itemId);
														onChange(next);
													},
												},
												t(`stage.${stage}`),
											),
										),
									)
								: null,
						])
					: null,

				errors.length > 0
					? m(
							'ul.plan-editor__errors',
							errors.map((error) => m('li.join__error', { key: error }, t(PLAN_ERROR_KEYS[error]))),
						)
					: null,
			]);
		},
	};
}
