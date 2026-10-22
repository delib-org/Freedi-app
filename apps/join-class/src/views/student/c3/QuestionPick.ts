import m from 'mithril';
import { t } from '@/lib/i18n';
import { ErrorLine } from './ErrorLine';

export interface PickQuestion {
	id: string;
	text: string;
	/** The teacher's one-line hint, if any. */
	hint?: string;
	/** Added by a student of this table ("our own question"). */
	own: boolean;
	/** Already asked at this table: greyed, last. */
	used: boolean;
}

export interface QuestionPickAttrs {
	questions: PickQuestion[];
	chosenId: string | null;
	/** Only the asker chooses (never at V1: nobody asks yet). */
	canChoose: boolean;
	onPick: (id: string) => void;
	/** Creates a table-owned sub-question; rejects when the rules refuse. */
	onAddOwn: (text: string) => Promise<void>;
	/** Every question was asked here: the own-question box is the main thing (UX 16.C A-own). */
	allUsed: boolean;
	/** The asker's open own-question box (A-own only): the parent keeps the text. */
	ownText: string;
	onOwnText: (text: string) => void;
}

class PickState {
	adding = false;
	text = '';
	busy = false;
	error: string | null = null;
}

function usedList(questions: readonly PickQuestion[]): m.Children {
	if (questions.length === 0) return null;

	return m('details.pick__used-list', { 'data-testid': 'used-questions' }, [
		m('summary', t('turn.used_questions', { n: questions.length })),
		m(
			'ul.pick__used-items',
			questions.map((q) => m('li.pick__item.pick__item--used', { key: q.id }, q.text)),
		),
	]);
}

function ownBox(attrs: QuestionPickAttrs): m.Children {
	return m('.pick__add.pick__add--open', [
		m('input.pick__input', {
			type: 'text',
			dir: 'auto',
			maxlength: 200,
			'data-testid': 'own-question-input',
			'aria-label': t('question.add_own'),
			placeholder: t('question.add_placeholder'),
			value: attrs.ownText,
			oncreate: (node: m.VnodeDOM) => (node.dom as HTMLInputElement).focus(),
			oninput: (event: Event) => attrs.onOwnText((event.target as HTMLInputElement).value),
		}),
	]);
}

/**
 * "Pick a question" (UX §2.6.1, 16.C): a radio list of the teacher's questions with
 * the ones already asked here greyed and last, and "+ our own question" for
 * anyone at the table. Everyone else sees the same list read-only. At V1 nobody
 * asks, so nobody chooses. When every question was asked, the list gives way to
 * the asker's own-question box and a collapsed list of what was asked (no repeats).
 */
export const QuestionPick: m.ClassComponent<QuestionPickAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: PickState }).self = new PickState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: PickState }).self as PickState;
		const { questions, chosenId, canChoose, onPick, onAddOwn, allUsed } = vnode.attrs;
		const ordered = allUsed
			? []
			: [...questions.filter((q) => !q.used), ...questions.filter((q) => q.used)];
		const submit = (): void => {
			const text = self.text.trim();
			if (!text || self.busy) return;
			self.busy = true;
			self.error = null;
			onAddOwn(text)
				.then(() => {
					self.text = '';
					self.adding = false;
				})
				.catch(() => {
					self.error = t('question.add_failed');
				})
				.finally(() => {
					self.busy = false;
					m.redraw();
				});
		};
		const askerWrites = allUsed && canChoose;

		return m('.pick', [
			allUsed
				? m('p.pick__all-used', { 'data-testid': 'questions-used' }, t('turn.questions_used'))
				: null,
			ordered.length > 0
				? [
						m('p.pick__title', t('question.teacher_list')),
						m(
							'.pick__list',
							{ role: 'radiogroup', 'aria-label': t('question.teacher_list') },
							ordered.map((q) =>
								m(
									'button.pick__item',
									{
										key: q.id,
										'data-testid': 'table-pick-question',
										type: 'button',
										role: 'radio',
										'aria-checked': chosenId === q.id ? 'true' : 'false',
										disabled: !canChoose || q.used ? true : undefined,
										class: [
											q.used ? 'pick__item--used' : '',
											chosenId === q.id ? 'pick__item--on' : '',
										]
											.filter(Boolean)
											.join(' '),
										onclick: () => onPick(q.id),
									},
									[
										q.own ? m('span.pick__eyebrow', t('question.add_own')) : null,
										m('span.pick__text', { dir: 'auto' }, q.text),
										q.hint && !q.used ? m('span.pick__hint', { dir: 'auto' }, q.hint) : null,
										q.used ? m('span.pick__used', t('question.asked')) : null,
									],
								),
							),
						),
					]
				: allUsed
					? null
					: m('p.pick__empty', t('question.none')),
			askerWrites
				? ownBox(vnode.attrs)
				: self.adding
					? m(
							'form.pick__add',
							{
								onsubmit: (event: Event) => {
									event.preventDefault();
									submit();
								},
							},
							[
								m('input.pick__input', {
									type: 'text',
									dir: 'auto',
									maxlength: 200,
									'aria-label': t('question.add_own'),
									placeholder: t('question.add_placeholder'),
									value: self.text,
									oninput: (event: Event) => {
										self.text = (event.target as HTMLInputElement).value;
									},
								}),
								m(
									'button.btn.btn--secondary',
									{ type: 'submit', disabled: self.busy || !self.text.trim() },
									t('question.add_confirm'),
								),
								m(ErrorLine, { message: self.error }),
							],
						)
					: m(
							'button.btn.btn--secondary.pick__add',
							{
								type: 'button',
								onclick: () => {
									self.adding = true;
								},
							},
							`+ ${t('question.add_own')}`,
						),
			allUsed ? usedList(questions.filter((q) => q.used)) : null,
		]);
	},
};
