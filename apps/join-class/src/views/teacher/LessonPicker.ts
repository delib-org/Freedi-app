import m from 'mithril';
import { t } from '@/lib/i18n';
import { getUserState } from '@/lib/user';
import { loadGames } from '@/lib/classPlans';
import type { PlanRow } from '@/lib/planTree';
import { captureException } from '@/lib/sentry';
import { filterLessons } from './homeHelpers';
import { ClassForm, closeClassForm, openClassForm } from './ClassForm';
import { renderCreate, resetCreate, startCreate } from './HomeCreate';
import {
	IDLE_PICKER,
	chooseNewPlan,
	countsKnown,
	listablePlans,
	needsFilter,
	openPicker,
	pickGame,
	pickPlan,
	stepBack,
	type GameCountOf,
	type PickerGame,
	type PickerMove,
	type PickerStep,
} from './lessonPickerFlow';

/**
 * "+ שיעור עם כיתה" under "פתוחים עכשיו": which lesson plan, which game when the plan has
 * two or more, then the class form (or a new plan, written first). The steps come from the
 * pure machine in lessonPickerFlow.ts; this file reads the plan's games, draws the step and
 * moves focus. Nothing is written until the class form or the plan name form submits.
 */

/** What the home hands over: its plan rows and how many games each plan has. */
export interface PickerSource {
	rows: readonly PlanRow[];
	countOf: GameCountOf;
}

let step: PickerStep = IDLE_PICKER;
let games: PickerGame[] = [];
let filterText = '';
/** The plan whose games are being read. */
let loadingPlanId: string | null = null;
let loadFailed = false;
let source: PickerSource = { rows: [], countOf: () => undefined };

export function isPickerOpen(): boolean {
	return step.kind !== 'idle';
}

/** The name form is the create area's: the home draws it and asks here when to. */
export function isPickerNaming(): boolean {
	return step.kind === 'name';
}

function focusTarget(move: PickerMove): void {
	let selector = '.teacher-home__new-lesson';
	if (move.focus === 'lead') selector = '#picker-lead';
	else if (move.focus === 'input') selector = '#teacher-new-title';
	document.querySelector<HTMLElement>(selector)?.focus();
}

/** Take a move: the new step, side effects of leaving and entering, one redraw, then focus. */
function apply(move: PickerMove): void {
	const leaving = step;
	const next = move.step;
	step = next;
	if (leaving.kind === 'class' && next.kind !== 'class') closeClassForm();
	if (leaving.kind === 'name' && next.kind !== 'name') resetCreate();
	if (next.kind === 'name' && leaving.kind !== 'name') startCreate(() => back());
	if (next.kind === 'class') {
		openClassForm(next.gameId, games.find((g) => g.gameId === next.gameId)?.title ?? '');
	}
	if (next.kind === 'idle') {
		filterText = '';
		games = [];
	}
	loadFailed = false;
	m.redraw.sync();
	focusTarget(move);
}

export function openLessonPicker(next: PickerSource): void {
	source = next;
	const listable = listablePlans(next.rows, next.countOf).length;
	apply(openPicker(step, listable, countsKnown(next.rows, next.countOf)));
}

/** Escape, "ביטול" on a list, or the name/class form's cancel: one step back. */
export function back(): void {
	apply(stepBack(step));
}

/** Leaves the picker without moving focus (the teacher went elsewhere on the page). */
export function closeLessonPicker(): void {
	if (step.kind === 'class') closeClassForm();
	if (step.kind === 'name') resetCreate();
	step = IDLE_PICKER;
	games = [];
	filterText = '';
	loadFailed = false;
	loadingPlanId = null;
}

async function choosePlan(row: PlanRow): Promise<void> {
	const uid = getUserState().user?.uid;
	if (!uid || loadingPlanId) return;
	loadingPlanId = row.planId;
	loadFailed = false;
	m.redraw();
	try {
		const list = await loadGames(row.planId, uid);
		games = list.map((g) => ({ gameId: g.gameId, title: g.title }));
		const move = pickPlan(step, row.planId, games);
		if (move) apply(move);
		else loadFailed = true;
	} catch (err) {
		captureException(err, { operation: 'lessonPicker.loadGames', planId: row.planId });
		loadFailed = true;
	} finally {
		loadingPlanId = null;
		m.redraw();
	}
}

function chooseGame(gameId: string): void {
	const move = pickGame(step, gameId);
	if (move) apply(move);
}

function addPlan(): void {
	const move = chooseNewPlan(step);
	if (move) apply(move);
}

function renderFilter(shown: number): m.Children {
	return [
		m('input.teacher-home__filter', {
			type: 'search',
			value: filterText,
			placeholder: t('teacher.home.filter'),
			'aria-label': t('teacher.home.filter'),
			oninput: (e: Event) => {
				filterText = (e.target as HTMLInputElement).value;
			},
			onkeydown: (e: KeyboardEvent) => {
				// the first Escape clears the text; with none left it steps back (page handler)
				if (e.key === 'Escape' && filterText) {
					filterText = '';
					e.stopPropagation();
				}
			},
		}),
		m(
			'.visually-hidden',
			{ role: 'status', 'aria-live': 'polite' },
			t('teacher.home.filter_count', { n: shown }),
		),
	];
}

function lead(key: string): m.Vnode {
	return m('p.teacher-home__lead', { id: 'picker-lead', tabindex: -1 }, t(key));
}

function option(
	label: string,
	attrs: Record<string, string>,
	onpick: () => void,
	busy = false,
): m.Vnode {
	return m('li', { key: attrs['data-id'] }, [
		m(
			'button.btn.btn--secondary.lesson-picker__option',
			{ type: 'button', ...attrs, disabled: busy, onclick: onpick },
			m('bdi', { dir: 'auto' }, label),
		),
	]);
}

function renderFailure(): m.Children {
	return loadFailed ? m('.teacher-home__error', { role: 'alert' }, t('teacher.copy.failed')) : null;
}

function renderPlanStep(): m.Vnode {
	const listable = listablePlans(source.rows, source.countOf);
	const filtering = needsFilter(listable.length);
	const shown = filtering ? filterLessons(listable, filterText) : listable;
	const known = countsKnown(source.rows, source.countOf);

	return m('.lesson-picker.teacher-home__form', { key: 'plan' }, [
		lead('teacher.lesson.plan_label'),
		filtering ? renderFilter(shown.length) : null,
		filtering && shown.length === 0
			? m('p.teacher-home__empty', t('teacher.home.filter_none'))
			: null,
		m(
			'ul.lesson-picker__list',
			shown.map((row) =>
				option(
					row.title,
					{ 'data-action': 'pick-plan', 'data-id': row.planId },
					() => void choosePlan(row),
					loadingPlanId !== null,
				),
			),
		),
		known ? null : m('p.teacher-home__help', { role: 'status' }, t('plan.loading')),
		renderFailure(),
		m('.lesson-picker__actions', [
			m(
				'button.btn.btn--secondary',
				{ type: 'button', 'data-action': 'picker-new-plan', onclick: () => addPlan() },
				t('teacher.new'),
			),
			m(
				'button.btn.btn--tertiary',
				{ type: 'button', onclick: () => back() },
				t('teacher.new.cancel'),
			),
		]),
	]);
}

function renderGameStep(): m.Vnode {
	return m('.lesson-picker.teacher-home__form', { key: 'game' }, [
		lead('teacher.lesson.game_label'),
		m(
			'ul.lesson-picker__list',
			games.map((g) =>
				option(g.title, { 'data-action': 'pick-game', 'data-id': g.gameId }, () =>
					chooseGame(g.gameId),
				),
			),
		),
		m('.lesson-picker__actions', [
			m(
				'button.btn.btn--tertiary',
				{ type: 'button', onclick: () => back() },
				t('teacher.new.cancel'),
			),
		]),
	]);
}

/** The open step, drawn under "פתוחים עכשיו" (null when closed). */
export function renderPicker(): m.Children {
	switch (step.kind) {
		case 'plan':
			return renderPlanStep();
		case 'game':
			return renderGameStep();
		case 'name':
			return renderCreate(false);
		case 'class':
			return m(ClassForm, { planId: step.planId, gameId: step.gameId, onBack: () => back() });
		default:
			return null;
	}
}
