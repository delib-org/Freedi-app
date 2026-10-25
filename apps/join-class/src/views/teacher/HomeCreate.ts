import m from 'mithril';
import { t } from '@/lib/i18n';
import { cloneLesson, createLesson } from '@/lib/lesson';
import { getRandomUID } from '@freedi/shared-types';
import type { ClassLessonEntry } from '@/lib/joinSubscriptions';
import { normalizeQuestionText } from './planHelpers';
import {
	IDLE_FLOW,
	back,
	chooseNew,
	choosePrevious,
	clearInvalid,
	copyFromRow,
	failSubmit,
	failureOf,
	isPicking,
	openCreate,
	pickSource,
	startSubmit,
	type CreateFlow,
	type CreateStep,
	type FlowMove,
	type FocusTarget,
} from './homeCreateFlow';

/**
 * The create area of the teacher home (IA 13.5 / 13.15, UX 13.D): the question
 * "which questions?", the name forms and the pick lead. One step at a time,
 * inline, driven by the pure machine in homeCreateFlow.ts. The list below the
 * area asks `picking()` whether its rows show "בחירה".
 */

const MAX_LESSON_TITLE = 200;
const NAME_SENTINEL = '\u0001';

let flow: CreateFlow = IDLE_FLOW;
let newTitle = '';
let copyTitle = '';
let copySourceTitle = '';

export function resetCreate(): void {
	flow = IDLE_FLOW;
	newTitle = '';
	copyTitle = '';
	copySourceTitle = '';
}

export function picking(): boolean {
	return isPicking(flow);
}

/** The step on screen: with no lessons the name form is open from the start. */
function effectiveStep(emptyState: boolean): CreateStep {
	return emptyState && flow.step.kind === 'idle' ? { kind: 'nameNew' } : flow.step;
}

export function createIdle(emptyState: boolean): boolean {
	return effectiveStep(emptyState).kind === 'idle';
}

function focusSelector(target: FocusTarget): string {
	switch (target.kind) {
		case 'newButton':
			return '.teacher-home__new';
		case 'choiceNew':
			return '[data-choice="new"]';
		case 'choicePrevious':
			return '[data-choice="previous"]';
		case 'pickLead':
			return '#pick-lead';
		case 'input':
			return '#teacher-new-title, #teacher-copy-title';
		case 'pickRow':
			return `[data-action="pick"][data-id="${CSS.escape(target.id)}"]`;
		default:
			return `[data-action="copy"][data-id="${CSS.escape(target.id)}"]`;
	}
}

const FOCUS_FALLBACK: Partial<Record<FocusTarget['kind'], FocusTarget>> = {
	pickRow: { kind: 'pickLead' },
	rowCopy: { kind: 'newButton' },
};

function applyFocus(target: FocusTarget): void {
	const el = document.querySelector<HTMLElement>(focusSelector(target));
	if (el) {
		el.focus();

		return;
	}
	const fallback = FOCUS_FALLBACK[target.kind];
	if (fallback) applyFocus(fallback);
}

/** Take a move: the new state, one redraw so the target exists, then focus. */
function go(move: FlowMove): void {
	flow = move.flow;
	m.redraw.sync();
	applyFocus(move.focus);
}

function sourceTitleOf(lessons: readonly ClassLessonEntry[], id: string): string {
	return lessons.find((l) => l.id === id)?.title ?? '';
}

// ---- entry points the page wires up ---------------------------------------------

export function startCreate(lessonCount: number): void {
	go(openCreate(flow, lessonCount));
}

/** Escape anywhere on the page: one step back (ignored while busy and in the empty state's only form). */
export function onPageEscape(e: KeyboardEvent, lessonCount: number): void {
	if (e.key !== 'Escape' || flow.step.kind === 'idle') return;
	e.preventDefault();
	go(back(flow, lessonCount));
}

/** A row's "new lesson, same questions". */
export function startCopyFromRow(lessons: readonly ClassLessonEntry[], id: string): void {
	copySourceTitle = sourceTitleOf(lessons, id);
	copyTitle = copySourceTitle;
	go(copyFromRow(flow, id, getRandomUID()));
}

/** "בחירה" on a row in pick mode. */
export function pickRow(lessons: readonly ClassLessonEntry[], id: string): void {
	copySourceTitle = sourceTitleOf(lessons, id);
	copyTitle = copySourceTitle;
	go(pickSource(flow, id, getRandomUID()));
}

function cancel(lessonCount: number): void {
	go(back(flow, lessonCount));
}

async function submit(e: Event): Promise<void> {
	e.preventDefault();
	// the empty state's form is open without the machine having moved
	if (flow.step.kind === 'idle') flow = { ...flow, step: { kind: 'nameNew' } };
	const step = flow.step;
	const title = normalizeQuestionText(
		step.kind === 'nameCopy' ? copyTitle : newTitle,
		MAX_LESSON_TITLE,
	);
	if (!title) {
		flow = failSubmit(flow, 'invalid');
		m.redraw.sync();
		applyFocus({ kind: 'input' });

		return;
	}
	const started = startSubmit(flow);
	if (!started) return;
	flow = started;
	m.redraw();
	try {
		const id =
			step.kind === 'nameCopy'
				? await cloneLesson(step.sourceId, title, flow.copyId ?? undefined)
				: await createLesson(title);
		resetCreate();
		m.route.set(`/t/${id}/plan`);
	} catch (err) {
		console.error('[TeacherHome] create lesson failed:', err);
		flow = failSubmit(flow, failureOf(err));
		m.redraw.sync();
		applyFocus({ kind: 'input' });
	}
}

// ---- rendering ------------------------------------------------------------------

function errorText(isCopy: boolean): string | null {
	switch (flow.error) {
		case 'invalid':
			return t('teacher.new.invalid');
		case 'not_yours':
			return t('teacher.copy.not_yours');
		case 'failed':
			return isCopy ? t('teacher.copy.failed') : t('teacher.new.failed');
		default:
			return null;
	}
}

function renderNameForm(kind: 'new' | 'copy', emptyState: boolean, lessonCount: number): m.Vnode {
	const isCopy = kind === 'copy';
	const inputId = isCopy ? 'teacher-copy-title' : 'teacher-new-title';
	const error = errorText(isCopy);
	const busy = flow.busy;
	const describedBy = [isCopy ? 'teacher-copy-help' : '', error ? 'create-error' : '']
		.filter(Boolean)
		.join(' ');

	return m(
		'form.teacher-home__form',
		{
			key: isCopy ? `copy-${flow.copyId}` : 'new',
			'aria-busy': busy ? 'true' : undefined,
			onsubmit: (e: Event) => void submit(e),
		},
		[
			emptyState ? m('p.teacher-home__lead', t('teacher.home.empty')) : null,
			isCopy ? renderCopyLead() : null,
			m(
				'label.teacher-home__label',
				{ for: inputId },
				t(isCopy ? 'teacher.copy.title_label' : 'teacher.new.title_label'),
			),
			m('input.teacher-home__input', {
				id: inputId,
				type: 'text',
				value: isCopy ? copyTitle : newTitle,
				maxlength: MAX_LESSON_TITLE,
				placeholder: isCopy ? undefined : t('teacher.new.placeholder'),
				disabled: busy,
				'aria-invalid': flow.error === 'invalid' ? 'true' : undefined,
				'aria-describedby': describedBy || undefined,
				oncreate: (vn: m.VnodeDOM) => {
					const input = vn.dom as HTMLInputElement;
					input.focus();
					// a copy keeps the source's name unless the teacher types over it
					if (isCopy) {
						input.select();
						scrollToCreateArea();
					}
				},
				oninput: (e: Event) => {
					const value = (e.target as HTMLInputElement).value;
					if (isCopy) copyTitle = value;
					else newTitle = value;
					flow = clearInvalid(flow);
				},
			}),
			isCopy
				? m('p.teacher-home__help', { id: 'teacher-copy-help' }, t('teacher.copy.help'))
				: null,
			m('.teacher-home__form-actions', [
				m(
					'button.btn.btn--primary',
					{ type: 'submit', disabled: busy, 'aria-busy': busy ? 'true' : undefined },
					busy ? t(isCopy ? 'teacher.copy.busy' : 'teacher.new.busy') : t('teacher.new.create'),
				),
				// Nothing to go back to when this is the only thing on the screen.
				emptyState
					? null
					: m(
							'button.btn.btn--tertiary',
							{ type: 'button', disabled: busy, onclick: () => cancel(lessonCount) },
							t('teacher.new.cancel'),
						),
			]),
			error ? m('.teacher-home__error', { id: 'create-error', role: 'alert' }, error) : null,
			busy
				? m(
						'.visually-hidden',
						{ role: 'status' },
						t(isCopy ? 'teacher.copy.busy' : 'teacher.new.busy'),
					)
				: null,
		],
	);
}

/** "השאלות מתוך „name”", the name isolated so English titles and the quote marks keep their order. */
function renderCopyLead(): m.Vnode {
	const [before, after = ''] = t('teacher.copy.source', { name: NAME_SENTINEL }).split(
		NAME_SENTINEL,
	);

	return m('p.teacher-home__lead', [before, m('bdi', { dir: 'auto' }, copySourceTitle), after]);
}

function renderChoose(lessonCount: number): m.Vnode {
	return m(
		'.teacher-home__form',
		{ key: 'choose', role: 'group', 'aria-labelledby': 'create-lead' },
		[
			m('p.teacher-home__lead', { id: 'create-lead' }, t('teacher.new.choose')),
			m('.teacher-home__choices', [
				m('.teacher-home__choice', [
					m(
						'button.btn.btn--secondary',
						{ type: 'button', 'data-choice': 'new', onclick: () => go(chooseNew(flow)) },
						t('teacher.new.from_scratch'),
					),
				]),
				m('.teacher-home__choice', [
					m(
						'button.btn.btn--secondary',
						{
							type: 'button',
							'data-choice': 'previous',
							'aria-describedby': 'choice-previous-help',
							onclick: () => go(choosePrevious(flow)),
						},
						t('teacher.new.from_previous'),
					),
					m(
						'p.teacher-home__help',
						{ id: 'choice-previous-help' },
						t('teacher.new.from_previous_help'),
					),
				]),
			]),
			m(
				'button.btn.btn--tertiary',
				{ type: 'button', onclick: () => cancel(lessonCount) },
				t('teacher.new.cancel'),
			),
		],
	);
}

function renderPickLead(lessonCount: number): m.Vnode {
	return m('.teacher-home__form', { key: 'pick' }, [
		m(
			'p.teacher-home__lead',
			{ id: 'pick-lead', class: 'teacher-home__pick-lead', tabindex: -1 },
			t('teacher.new.pick_lead'),
		),
		m(
			'button.btn.btn--tertiary',
			{ type: 'button', onclick: () => cancel(lessonCount) },
			t('teacher.new.cancel'),
		),
	]);
}

/** A copy started from a row far down the list: show where the step went. */
function scrollToCreateArea(): void {
	const area = document.querySelector<HTMLElement>('.teacher-home__create');
	if (!area || flow.step.kind !== 'nameCopy' || flow.step.via !== 'row') return;
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	area.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
}

/** The step that replaces "+ שיעור חדש"; the caller shows the button when `createIdle`. */
export function renderCreate(emptyState: boolean, lessonCount: number): m.Vnode {
	const step = effectiveStep(emptyState);
	let body: m.Vnode;
	if (step.kind === 'choose') body = renderChoose(lessonCount);
	else if (step.kind === 'pick') body = renderPickLead(lessonCount);
	else if (step.kind === 'nameCopy') body = renderNameForm('copy', emptyState, lessonCount);
	else body = renderNameForm('new', emptyState, lessonCount);

	return m('.teacher-home__create', [body]);
}
