import m from 'mithril';
import { t } from '@/lib/i18n';
import { getRandomUID } from '@freedi/shared-types';
import { normalizeQuestionText } from './planHelpers';
import {
	IDLE_FLOW,
	back,
	chooseNew,
	choosePrevious,
	clearInvalid,
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
 * The create area (docs/ia/join-class-lesson-plan.md 6): the same inline machine for two
 * jobs. On the teacher home (`plan` mode) it names a new lesson plan. On the plan screen
 * (`game` mode) it adds a game: "which questions?", the name forms and the pick lead. One
 * step at a time, driven by the pure machine in homeCreateFlow.ts. The list around it asks
 * `picking()` whether its rows show "בחירה".
 */

const MAX_TITLE = 200;
const NAME_SENTINEL = '\u0001';

export type CreateMode = 'plan' | 'game';

/** What the page does with the form: both resolve to the path to go to. */
export interface CreateHooks {
	mode: CreateMode;
	/** The number of games/lessons a new game may copy from (0 = nothing to copy). */
	sourceCount: () => number;
	/** A blank game is possible (not on an old lesson that is only a plan so far). */
	blankAllowed: () => boolean;
	createNew: (title: string) => Promise<string>;
	createCopy: (sourceId: string, title: string, newId: string) => Promise<string>;
}

let hooks: CreateHooks | null = null;
let flow: CreateFlow = IDLE_FLOW;
let newTitle = '';
let copyTitle = '';
let copySourceTitle = '';

export function configureCreate(next: CreateHooks): void {
	hooks = next;
}

export function resetCreate(): void {
	flow = IDLE_FLOW;
	newTitle = '';
	copyTitle = '';
	copySourceTitle = '';
}

export function picking(): boolean {
	return isPicking(flow);
}

const isPlanMode = (): boolean => hooks?.mode === 'plan';

/** Plan mode has nothing to choose between; game mode asks when there is something to copy. */
function copyable(): number {
	return isPlanMode() ? 0 : (hooks?.sourceCount() ?? 0);
}

/** The step on screen: with nothing yet the name form is open from the start. */
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

// ---- entry points the page wires up ---------------------------------------------

export function startCreate(): void {
	if (flow.step.kind !== 'idle') return;
	// An old lesson that is only a plan so far cannot get a blank game (the plan doc may only
	// be made by the server, from the lesson): the only way in is "questions from another game".
	if (!isPlanMode() && !(hooks?.blankAllowed() ?? true)) {
		go(choosePrevious(openCreate(flow, 1).flow));

		return;
	}
	go(openCreate(flow, copyable()));
}

/** Escape anywhere on the page: one step back (ignored while busy and in the empty state's only form). */
export function onPageEscape(e: KeyboardEvent): void {
	if (e.key !== 'Escape' || flow.step.kind === 'idle') return;
	e.preventDefault();
	cancel();
}

/** "בחירה" on a row in pick mode. */
export function pickRow(id: string, title: string): void {
	copySourceTitle = title;
	copyTitle = title;
	go(pickSource(flow, id, getRandomUID()));
}

function cancel(): void {
	// a plan's only form goes straight back to the button; a game's goes one step back
	if (isPlanMode() && !flow.busy) {
		flow = IDLE_FLOW;
		m.redraw.sync();
		applyFocus({ kind: 'newButton' });

		return;
	}
	go(back(flow, copyable()));
}

async function submit(e: Event): Promise<void> {
	e.preventDefault();
	if (!hooks) return;
	// the empty state's form is open without the machine having moved
	if (flow.step.kind === 'idle') flow = { ...flow, step: { kind: 'nameNew' } };
	const step = flow.step;
	const title = normalizeQuestionText(step.kind === 'nameCopy' ? copyTitle : newTitle, MAX_TITLE);
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
		const path =
			step.kind === 'nameCopy'
				? await hooks.createCopy(step.sourceId, title, flow.copyId ?? getRandomUID())
				: await hooks.createNew(title);
		resetCreate();
		m.route.set(path);
	} catch (err) {
		console.error('[HomeCreate] create failed:', err);
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

function renderNameForm(kind: 'new' | 'copy', emptyState: boolean): m.Vnode {
	const isCopy = kind === 'copy';
	const inputId = isCopy ? 'teacher-copy-title' : 'teacher-new-title';
	const error = errorText(isCopy);
	const busy = flow.busy;
	const plan = isPlanMode();
	const describedBy = [isCopy ? 'teacher-copy-help' : '', error ? 'create-error' : '']
		.filter(Boolean)
		.join(' ');
	const labelKey = isCopy
		? 'teacher.copy.title_label'
		: plan
			? 'teacher.new.title_label'
			: 'game.title_label';
	const placeholderKey = plan ? 'teacher.new.placeholder' : 'game.placeholder';

	return m(
		'form.teacher-home__form',
		{
			key: isCopy ? `copy-${flow.copyId}` : 'new',
			'aria-busy': busy ? 'true' : undefined,
			onsubmit: (e: Event) => void submit(e),
		},
		[
			emptyState && plan ? m('p.teacher-home__lead', t('teacher.home.empty')) : null,
			isCopy ? renderCopyLead() : null,
			m('label.teacher-home__label', { for: inputId }, t(labelKey)),
			m('input.teacher-home__input', {
				id: inputId,
				type: 'text',
				value: isCopy ? copyTitle : newTitle,
				maxlength: MAX_TITLE,
				placeholder: isCopy ? undefined : t(placeholderKey),
				disabled: busy,
				'aria-invalid': flow.error === 'invalid' ? 'true' : undefined,
				'aria-describedby': describedBy || undefined,
				oncreate: (vn: m.VnodeDOM) => {
					const input = vn.dom as HTMLInputElement;
					input.focus();
					// a copy keeps the source's name unless the teacher types over it
					if (isCopy) input.select();
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
							{ type: 'button', disabled: busy, onclick: () => cancel() },
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

function renderChoose(): m.Vnode {
	return m(
		'.teacher-home__form',
		{ key: 'choose', role: 'group', 'aria-labelledby': 'create-lead' },
		[
			m('p.teacher-home__lead', { id: 'create-lead' }, t('teacher.new.choose')),
			m('.teacher-home__choices', [
				hooks?.blankAllowed() === false
					? null
					: m('.teacher-home__choice', [
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
				{ type: 'button', onclick: () => cancel() },
				t('teacher.new.cancel'),
			),
		],
	);
}

function renderPickLead(): m.Vnode {
	return m('.teacher-home__form', { key: 'pick' }, [
		m(
			'p.teacher-home__lead',
			{ id: 'pick-lead', class: 'teacher-home__pick-lead', tabindex: -1 },
			t('teacher.new.pick_lead'),
		),
		m(
			'button.btn.btn--tertiary',
			{ type: 'button', onclick: () => cancel() },
			t('teacher.new.cancel'),
		),
	]);
}

/** The step that replaces the "+" button; the caller shows the button when `createIdle`. */
export function renderCreate(emptyState: boolean): m.Vnode {
	const step = effectiveStep(emptyState);
	let body: m.Vnode;
	if (step.kind === 'choose') body = renderChoose();
	else if (step.kind === 'pick') body = renderPickLead();
	else if (step.kind === 'nameCopy') body = renderNameForm('copy', emptyState);
	else body = renderNameForm('new', emptyState);

	return m('.teacher-home__create', [body]);
}
