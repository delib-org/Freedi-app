import m from 'mithril';
import { t } from '../../../lib/i18n';
import { QUESTION_KINDS } from '../../../lib/flows/stagePlanEditor';
import { questionKindLabel } from './stepMeta';
import {
	AgoraStage,
	CutoffBy,
	AGORA_STAGE_PLAN,
	defaultQuestionSelection,
	defaultVotingTrigger,
	questionKindOf,
	type AgoraQuestionKind,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

type ItemPatch = Partial<Omit<AgoraStagePlanItem, 'itemId' | 'stage'>>;

export interface StepEditorAttrs {
	item: AgoraStagePlanItem;
	/** Step number, for the ids that tie labels to their fields */
	index: number;
	onPatch: (patch: ItemPatch) => void;
	/** Put the cursor in the question's words when the editor mounts */
	focusWords: boolean;
	onFocused: () => void;
	onDone: () => void;
}

/**
 * One radio-card group. Arrow keys move the choice (the WAI radio pattern),
 * one tab stop for the whole group, and in RTL left and right swap meaning.
 */
function radioCards<T extends string>(attrs: {
	name: string;
	labelId: string;
	options: readonly T[];
	value: T;
	label: (option: T) => string;
	description?: (option: T) => string;
	onPick: (option: T) => void;
	compact?: boolean;
}): m.Children {
	const { name, labelId, options, value, label, description, onPick, compact } = attrs;

	return m(
		'.step-editor__choices',
		{
			role: 'radiogroup',
			'aria-labelledby': labelId,
			class: compact ? 'step-editor__choices--compact' : undefined,
		},
		options.map((option) =>
			m(
				'button.step-editor__choice',
				{
					key: option,
					type: 'button',
					role: 'radio',
					'aria-checked': String(option === value),
					tabindex: option === value ? 0 : -1,
					'data-choice': `${name}-${option}`,
					onclick: () => onPick(option),
					onkeydown: (event: KeyboardEvent) => {
						const forward = ['ArrowDown', 'ArrowRight'].includes(event.key);
						const back = ['ArrowUp', 'ArrowLeft'].includes(event.key);
						if (!forward && !back) return;
						event.preventDefault();
						const rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl';
						const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
						const step = (forward ? 1 : -1) * (rtl && horizontal ? -1 : 1);
						const at = options.indexOf(option);
						const next = options[(at + step + options.length) % options.length];
						onPick(next);
						const group = (event.currentTarget as HTMLElement).parentElement;
						requestAnimationFrame(() =>
							group?.querySelector<HTMLButtonElement>(`[data-choice="${name}-${next}"]`)?.focus(),
						);
					},
				},
				[
					m('span.step-editor__radio', { 'aria-hidden': 'true' }),
					m('span.step-editor__choice-text', [
						m('span.step-editor__choice-name', label(option)),
						description ? m('span.step-editor__choice-desc', description(option)) : null,
					]),
				],
			),
		),
	);
}

type CutoffChoice = 'top' | 'threshold' | 'all';
const CUTOFF_CHOICES: readonly CutoffChoice[] = ['top', 'threshold', 'all'];

function cutoffChoice(cutoffBy: CutoffBy): CutoffChoice {
	if (cutoffBy === CutoffBy.aboveThreshold) return 'threshold';
	if (cutoffBy === CutoffBy.all) return 'all';

	return 'top';
}

function cutoffBy(choice: CutoffChoice): CutoffBy {
	if (choice === 'threshold') return CutoffBy.aboveThreshold;
	if (choice === 'all') return CutoffBy.all;

	return CutoffBy.topOptions;
}

function numberField(
	id: string,
	label: string,
	value: number,
	limits: { min: string; max: string; step: string },
	onchange: (next: number) => void,
): m.Children {
	return m('.step-editor__number-row', [
		m('label.step-editor__number-label', { for: id }, label),
		m('input.step-editor__number[type=number]', {
			id,
			value,
			inputmode: 'decimal',
			...limits,
			onchange: (event: Event) => {
				const next = Number((event.target as HTMLInputElement).value);
				if (Number.isFinite(next)) onchange(next);
			},
		}),
	]);
}

/**
 * The editor that opens under a step's card: a question's type, words,
 * explanation and cutoff, or a discussion's auto-vote rule. Every change is
 * a patch on the parent's plan, so nothing here can be lost by closing it.
 */
export const StepEditor: m.Component<StepEditorAttrs> = {
	view({ attrs }) {
		const { item, index, onPatch, focusWords, onFocused, onDone } = attrs;
		const id = `step-editor-${index}`;

		const done = m(
			'.step-editor__footer',
			m(
				'button.btn.btn--sm.btn--secondary.step-editor__done',
				{ type: 'button', onclick: onDone },
				t('planb.done'),
			),
		);

		if (item.stage === AgoraStage.deliberation) {
			const rule = item.votingTrigger ?? { ...defaultVotingTrigger(), enabled: false };
			const patchRule = (next: Partial<typeof rule>): void =>
				onPatch({ votingTrigger: { ...rule, ...next } });

			return m('.step-editor', [
				m('label.step-editor__check', [
					m('input[type=checkbox]', {
						checked: rule.enabled,
						onchange: (event: Event) =>
							patchRule({ enabled: (event.target as HTMLInputElement).checked }),
					}),
					m('span', t('startGame.plan_trigger')),
				]),
				rule.enabled
					? m('.step-editor__group', [
							numberField(
								`${id}-single`,
								t('startGame.plan_trigger_single'),
								rule.singleMin,
								{ min: '-1', max: '1', step: '0.05' },
								(next) => patchRule({ singleMin: next }),
							),
							numberField(
								`${id}-pair`,
								t('startGame.plan_trigger_pair'),
								rule.pairMin,
								{ min: '-1', max: '1', step: '0.05' },
								(next) => patchRule({ pairMin: next }),
							),
							numberField(
								`${id}-raters`,
								t('startGame.plan_trigger_min_raters'),
								rule.minRaters,
								{ min: '1', max: '50', step: '1' },
								(next) => patchRule({ minRaters: next }),
							),
							m('p.step-editor__hint', t('startGame.plan_trigger_hint')),
						])
					: null,
				done,
			]);
		}

		if (item.stage !== AgoraStage.question) return null;

		const kind = questionKindOf(item);
		const isOpen = kind === 'open';
		const selection = item.selection ?? defaultQuestionSelection();
		const choice = cutoffChoice(selection.cutoffBy);

		return m('.step-editor', [
			// 1. What kind of question — a readable list, not a native select
			m('.step-editor__group', [
				m('p.step-editor__label', { id: `${id}-kind` }, t('startGame.plan_question_kind')),
				radioCards<AgoraQuestionKind>({
					name: `${id}-kind`,
					labelId: `${id}-kind`,
					options: QUESTION_KINDS,
					value: kind,
					label: questionKindLabel,
					description: (option) => t(`planb.desc_${option}`),
					onPick: (option) => {
						if (option !== kind) onPatch({ kind: option });
					},
				}),
			]),

			// 2. The words the students read
			m('.step-editor__group', [
				m(
					'label.step-editor__label',
					{ for: `${id}-words` },
					t(isOpen ? 'startGame.plan_question_title' : 'startGame.plan_round_title'),
				),
				m('textarea.step-editor__input.step-editor__input--words', {
					id: `${id}-words`,
					value: item.title ?? '',
					rows: 2,
					maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
					placeholder: isOpen ? t('startGame.quick_question_ph') : t(`round.${kind}.prompt`),
					'aria-invalid': isOpen && !(item.title ?? '').trim() ? 'true' : undefined,
					oncreate: (node: m.VnodeDOM) => {
						if (!focusWords) return;
						onFocused();
						(node.dom as HTMLTextAreaElement).focus();
					},
					oninput: (event: InputEvent) =>
						onPatch({ title: (event.target as HTMLTextAreaElement).value }),
				}),
			]),

			m('.step-editor__group', [
				m(
					'label.step-editor__label',
					{ for: `${id}-explanation` },
					t(isOpen ? 'startGame.plan_question_explanation' : 'startGame.plan_round_explanation'),
				),
				m('textarea.step-editor__input', {
					id: `${id}-explanation`,
					value: item.explanation ?? '',
					rows: 2,
					maxlength: AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
					placeholder: isOpen ? undefined : t(`round.${kind}.hint`),
					oninput: (event: InputEvent) =>
						onPatch({ explanation: (event.target as HTMLTextAreaElement).value }),
				}),
			]),

			// 3. An open question carries some answers on; a round carries every text
			isOpen
				? m('.step-editor__group', [
						m('p.step-editor__label', { id: `${id}-cutoff` }, t('startGame.plan_cutoff')),
						radioCards<CutoffChoice>({
							name: `${id}-cutoff`,
							labelId: `${id}-cutoff`,
							options: CUTOFF_CHOICES,
							value: choice,
							compact: true,
							label: (option) => t(`startGame.plan_cutoff_${option}`),
							onPick: (option) =>
								onPatch({ selection: { ...selection, cutoffBy: cutoffBy(option) } }),
						}),
						choice === 'top'
							? numberField(
									`${id}-n`,
									t('startGame.plan_cutoff_n'),
									selection.numberOfResults,
									{ min: '1', max: '10', step: '1' },
									(next) => onPatch({ selection: { ...selection, numberOfResults: next } }),
								)
							: null,
						choice === 'threshold'
							? numberField(
									`${id}-min`,
									t('startGame.plan_cutoff_min'),
									selection.cutoffNumber,
									{ min: '-1', max: '1', step: '0.05' },
									(next) => onPatch({ selection: { ...selection, cutoffNumber: next } }),
								)
							: null,
					])
				: null,
			done,
		]);
	},
};
