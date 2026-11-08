import m from 'mithril';
import { t } from '@/lib/i18n';

export interface PickQuestion {
	id: string;
	text: string;
	/** The teacher's one-line hint, if any. */
	hint?: string;
	/** Written by a student of this table ("our own question"). */
	own: boolean;
	/** Already asked at this table: greyed, last, not tappable. */
	used: boolean;
}

export interface QuestionPickAttrs {
	questions: PickQuestion[];
	/** The question chosen on this phone only (nothing is written until "I want to start"). */
	selectedId: string | null;
	/** The own-question row is the chosen one. */
	ownSelected: boolean;
	ownText: string;
	/** Every teacher question was asked here (or there are none): the own row comes first and open. */
	teacherUsedUp: boolean;
	/** There are no teacher questions at all (no "all asked" note). */
	noTeacherQuestions: boolean;
	/** Students may add their own question (IA 25.4); off: no own row, no own questions, no "all asked" note. */
	allowOwn: boolean;
	disabled: boolean;
	onSelect: (id: string) => void;
	onSelectOwn: () => void;
	onOwnText: (text: string) => void;
}

/** Arrow keys move the choice, Space/Enter selects (the buttons already do): a radio group. */
function moveWithArrows(event: KeyboardEvent): void {
	const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
	const step = keys[event.key];
	if (!step) return;
	const group = event.currentTarget as HTMLElement;
	const radios = Array.from(
		group.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])'),
	);
	const at = radios.indexOf(document.activeElement as HTMLElement);
	if (radios.length === 0) return;
	event.preventDefault();
	const next = radios[(Math.max(at, 0) + step + radios.length) % radios.length];
	next.focus();
	next.click();
}

function questionRow(q: PickQuestion, attrs: QuestionPickAttrs): m.Vnode {
	const on = !attrs.ownSelected && attrs.selectedId === q.id;

	return m(
		'button.pick__item',
		{
			key: q.id,
			'data-testid': 'table-pick-question',
			type: 'button',
			role: 'radio',
			'aria-checked': on ? 'true' : 'false',
			disabled: attrs.disabled ? true : undefined,
			class: on ? 'pick__item--on' : '',
			onclick: () => attrs.onSelect(q.id),
		},
		[
			m('span.pick__radio', { 'aria-hidden': 'true' }, on ? '◉' : '○'),
			m('span.pick__body', [
				q.own ? m('span.pick__eyebrow', t('question.add_own')) : null,
				m('span.pick__text', { dir: 'auto' }, q.text),
				q.hint ? m('span.pick__hint', { dir: 'auto' }, q.hint) : null,
			]),
		],
	);
}

/** "+ our own question": a radio row that opens its own text field (no save button of its own). */
function ownRow(attrs: QuestionPickAttrs): m.Vnode {
	const on = attrs.ownSelected;

	return m('.pick__own', { key: 'own', class: on ? 'pick__item--on' : '' }, [
		m(
			'button.pick__own-head',
			{
				type: 'button',
				role: 'radio',
				'data-testid': 'table-pick-own',
				'aria-checked': on ? 'true' : 'false',
				disabled: attrs.disabled ? true : undefined,
				onclick: attrs.onSelectOwn,
			},
			[
				m('span.pick__radio', { 'aria-hidden': 'true' }, on ? '◉' : '+'),
				m('span.pick__text', t('question.add_own')),
			],
		),
		on
			? m('input.pick__input', {
					type: 'text',
					dir: 'auto',
					maxlength: 200,
					'data-testid': 'own-question-input',
					'aria-label': t('question.add_own'),
					placeholder: t('question.add_placeholder'),
					value: attrs.ownText,
					disabled: attrs.disabled ? true : undefined,
					oncreate: (node: m.VnodeDOM) => (node.dom as HTMLInputElement).focus(),
					oninput: (event: Event) => attrs.onOwnText((event.target as HTMLInputElement).value),
				})
			: null,
	]);
}

function usedRow(q: PickQuestion): m.Vnode {
	return m(
		'.pick__item.pick__item--used',
		{ key: q.id, role: 'radio', 'aria-checked': 'false', 'aria-disabled': 'true' },
		[
			m('span.pick__body', [
				q.own ? m('span.pick__eyebrow', t('question.add_own')) : null,
				m('span.pick__text', { dir: 'auto' }, q.text),
			]),
			m('span.pick__used', t('question.asked')),
		],
	);
}

function usedFolded(used: readonly PickQuestion[]): m.Children {
	if (used.length === 0) return null;

	return m('details.pick__used-list', { 'data-testid': 'used-questions' }, [
		m('summary', t('turn.used_questions', { n: used.length })),
		m(
			'ul.pick__used-items',
			used.map((q) => m('li.pick__item.pick__item--used', { key: q.id }, q.text)),
		),
	]);
}

/**
 * "Pick a question" (UX 16.C): a radio list of the teacher's questions and this
 * table's own, the used ones greyed and last (folded away once the teacher's
 * questions are used up), and "+ our own question" always in the list. Choosing
 * is local to this phone; "I want to start" is what writes. When the teacher's
 * questions are used up the own row is first and open.
 */
export const QuestionPick: m.ClassComponent<QuestionPickAttrs> = {
	view(vnode) {
		const attrs = vnode.attrs;
		const { questions, teacherUsedUp, noTeacherQuestions } = attrs;
		const free = questions.filter((q) => !q.used);
		const used = questions.filter((q) => q.used);
		const teacher = free.filter((q) => !q.own);
		const ownFree = free.filter((q) => q.own);

		// Keyed rows only (no null, no nested array): mithril refuses a keyed list with holes.
		const own: m.Vnode[] = attrs.allowOwn ? [ownRow(attrs)] : [];
		const rows: m.Vnode[] = teacherUsedUp
			? [...own, ...ownFree.map((q) => questionRow(q, attrs))]
			: [
					...(teacher.length > 0
						? [m('p.pick__title', { key: 'title' }, t('question.teacher_list'))]
						: []),
					...teacher.map((q) => questionRow(q, attrs)),
					...ownFree.map((q) => questionRow(q, attrs)),
					...own,
					...used.map(usedRow),
				];

		return m('.pick', [
			attrs.allowOwn && teacherUsedUp && !noTeacherQuestions
				? m('p.pick__all-used', { 'data-testid': 'questions-used' }, t('turn.questions_used'))
				: null,
			m(
				'.pick__list',
				{ role: 'radiogroup', 'aria-label': t('turn.instr_pick'), onkeydown: moveWithArrows },
				rows,
			),
			teacherUsedUp ? usedFolded(used) : null,
		]);
	},
};
