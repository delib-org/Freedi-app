import m from 'mithril';
import { IntroText } from '@/components/IntroText';
import { t } from '@/lib/i18n';
import {
	continueList,
	isBoldShortcut,
	toggleBold,
	toggleList,
	type EditResult,
	type ListKind,
} from '@/lib/classroom/introEditing';
import { INTRO_BLOCKS_MAX, INTRO_TEXT_MAX } from '@/lib/classroom/introText';
import { getFieldError, getMainId } from './planController';
import {
	TEXT_KEY,
	commitIntroText,
	getBlocksLoad,
	introTextCheck,
	introTextValue,
	onIntroTextInput,
	openIntro,
} from './planIntroController';
import { CLASS_GAME_MAX_TEXT_LENGTH } from '@freedi/shared-types';

/** The text half of the "הקדמה" section (UX 14.B): one textarea holding
 *  markdown-lite, a three-button toolbar that writes the markers, the
 *  character count and a preview once the text has formatting. */

const INPUT_ID = 'intro-text';
const COUNT_ID = 'intro-text-count';
const ERROR_ID = 'intro-text-error';

function textarea(): HTMLTextAreaElement | null {
	return document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
}

/** Replace only the span that changed, through execCommand, so Ctrl+Z undoes a toolbar action. */
function applyEdit(el: HTMLTextAreaElement, edit: EditResult): void {
	const old = el.value;
	const next = edit.value;
	let head = 0;
	while (head < old.length && head < next.length && old[head] === next[head]) head += 1;
	let tail = 0;
	while (
		tail < old.length - head &&
		tail < next.length - head &&
		old[old.length - 1 - tail] === next[next.length - 1 - tail]
	) {
		tail += 1;
	}
	const insert = next.slice(head, next.length - tail);
	el.focus();
	el.setSelectionRange(head, old.length - tail);
	let done = false;
	try {
		done =
			insert === ''
				? document.execCommand('delete')
				: document.execCommand('insertText', false, insert);
	} catch (err) {
		console.error('[PlanScreen] execCommand failed, using setRangeText:', err);
	}
	if (!done || el.value !== next) {
		el.value = next;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}
	el.setSelectionRange(edit.start, edit.end);
}

function run(edit: (value: string, start: number, end: number) => EditResult): void {
	const el = textarea();
	if (!el || el.disabled) return;
	applyEdit(el, edit(el.value, el.selectionStart, el.selectionEnd));
}

function onKeydown(e: KeyboardEvent): void {
	const el = e.target as HTMLTextAreaElement;
	if (isBoldShortcut(e)) {
		e.preventDefault();
		run(toggleBold);

		return;
	}
	if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey) return;
	if (el.selectionStart !== el.selectionEnd) return;
	const edit = continueList(el.value, el.selectionStart);
	if (!edit) return;
	e.preventDefault();
	applyEdit(el, edit);
}

/** Keeps the textarea's focus and selection, so its blur (the save) does not fire on a toolbar press. */
function keepFocus(e: Event): void {
	e.preventDefault();
}

function tool(labelKey: string, onclick: () => void, bold = false): m.Vnode {
	return m(
		'button.intro-editor__tool',
		{
			type: 'button',
			class: bold ? 'intro-editor__tool--bold' : '',
			disabled: getBlocksLoad() !== 'ready',
			onpointerdown: keepFocus,
			onmousedown: keepFocus,
			onclick,
		},
		t(labelKey),
	);
}

function listTool(labelKey: string, kind: ListKind): m.Vnode {
	return tool(labelKey, () => run((v, s, e) => toggleList(v, s, e, kind)));
}

function fieldError(key: string): m.Vnode | null {
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

export const IntroEditor: m.Component = {
	view() {
		const load = getBlocksLoad();
		const check = introTextCheck();
		const over = check.tooLong || check.tooMany || check.lineTooLong;
		const formatted = check.blocks.some((b) => b.contentHtml !== undefined || b.type === 'li');
		const errorText = check.tooLong
			? t('plan.intro.text.too_long', { max: INTRO_TEXT_MAX })
			: check.tooMany
				? t('plan.intro.text.too_many', { max: INTRO_BLOCKS_MAX })
				: check.lineTooLong
					? t('plan.intro.text.line_too_long', { max: CLASS_GAME_MAX_TEXT_LENGTH })
					: '';

		return m('.plan-card.intro-editor', [
			m('.plan-card__main', [
				m('label.intro-editor__label', { for: INPUT_ID }, t('plan.intro.text.label')),
				m(
					'.intro-editor__tools',
					{
						role: 'toolbar',
						'aria-label': t('plan.intro.text.label'),
						'aria-controls': INPUT_ID,
					},
					[
						tool('plan.intro.bold', () => run(toggleBold), true),
						listTool('plan.intro.list', 'ul'),
						listTool('plan.intro.numbered', 'ol'),
					],
				),
				m('textarea.intro-editor__input', {
					id: INPUT_ID,
					rows: 6,
					dir: 'auto',
					value: introTextValue(),
					disabled: load !== 'ready',
					placeholder: t('plan.intro.text.placeholder'),
					'aria-invalid': over ? 'true' : undefined,
					'aria-describedby': over ? `${COUNT_ID} ${ERROR_ID}` : COUNT_ID,
					oninput: (e: Event) => onIntroTextInput((e.target as HTMLTextAreaElement).value),
					onblur: commitIntroText,
					onkeydown: onKeydown,
				}),
				m(
					'p.intro-editor__count',
					{ id: COUNT_ID, class: over ? 'intro-editor__count--over' : '' },
					t('plan.intro.text.count', { n: check.length, max: INTRO_TEXT_MAX }),
				),
				over ? m('p.plan-card__error', { id: ERROR_ID, role: 'alert' }, errorText) : null,
				load === 'error'
					? m('.plan-card__error', { role: 'alert' }, [
							m('span', t('plan.error.load')),
							m(
								'button.btn.btn--tertiary.btn--small',
								{ type: 'button', onclick: () => void openIntro(getMainId()) },
								t('plan.error.retry'),
							),
						])
					: null,
				fieldError(TEXT_KEY),
				formatted
					? m('.intro-editor__preview', { 'aria-hidden': 'true' }, [
							m('p.intro-editor__preview-label', t('plan.intro.preview')),
							m(IntroText, { blocks: check.blocks, size: 'preview' }),
						])
					: null,
			]),
		]);
	},
};
