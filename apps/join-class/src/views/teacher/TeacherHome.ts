import m from 'mithril';
import '@/styles/teacher.scss';
import { getRandomUID } from '@freedi/shared-types';
import { getUserState, signOut } from '@/lib/user';
import { getLang, t } from '@/lib/i18n';
import { setFollowLessonLanguage } from '@/lib/store';
import { WizColFooter } from '@/components/WizColFooter';
import { BrandLogo } from '@/components/BrandLogo';
import type { Unsubscribe } from '@/lib/firebase';
import { ensurePlan, loadGames, writeGame } from '@/lib/classPlans';
import { emptySnapshot } from '@/lib/classroom/gameSnapshotEdit';
import { gamePathOf, planPathOf } from '@/lib/lessonLinks';
import type { ClassLessonEntry } from '@/lib/joinSubscriptions';
import { buildPlanRows, openNow, type PlanRow } from '@/lib/planTree';
import { watchLibrary, type TeacherLibrary } from '@/lib/teacherLibrary';
import { filterLessons } from './homeHelpers';
import {
	renderChip,
	renderLessonActions,
	classLabelOf,
	givenNameOf,
	rowAriaName,
} from './LessonRow';
import {
	configureCreate,
	createIdle,
	onPageEscape,
	renderCreate,
	resetCreate,
	startCreate,
} from './HomeCreate';
import { captureException } from '@/lib/sentry';
import {
	closeLessonPicker,
	isPickerNaming,
	isPickerOpen,
	back as pickerBack,
	openLessonPicker,
	renderPicker,
} from './LessonPicker';
import { PLAN_FILTER_FROM } from './lessonPickerFlow';

let library: TeacherLibrary = { plans: [], lessons: [], ready: false };
let unsub: Unsubscribe | null = null;
let filterText = '';
/** Games per plan, read once per plan change (the plan doc's `lastUpdate` moves when a game is added). */
const gameCounts = new Map<string, { stamp: number; count: number | null | undefined }>();
/** A stamp no plan doc has, so a failed count read is tried again on the next update. */
const FAILED_STAMP = -1;
/** The rows the view last drew, for the picker's open (it opens from a click, outside the view). */
let currentRows: PlanRow[] = [];
/** Ids of the plan and first game being made; kept until it succeeds so a retry reuses them. */
let pendingIds: { planId: string; gameId: string } | null = null;

function accountName(): string {
	const user = getUserState().user;

	return user?.displayName || user?.email || '';
}

async function handleSignOut(): Promise<void> {
	try {
		await signOut();
	} catch (err) {
		console.error('[TeacherHome] sign-out failed:', err);
	}
	m.route.set('/');
}

/** "+ מערך שיעור חדש": the plan doc and a first game named after it, then the game's questions (flow 1). */
async function createPlan(title: string): Promise<string> {
	const uid = getUserState().user?.uid;
	if (!uid) throw new Error('not signed in');
	const ids = pendingIds ?? { planId: getRandomUID(), gameId: getRandomUID() };
	pendingIds = ids;
	await ensurePlan(ids.planId, title, uid);
	await writeGame({
		planId: ids.planId,
		gameId: ids.gameId,
		title,
		order: 0,
		snapshot: emptySnapshot(getLang()),
		ownerUid: uid,
	});
	pendingIds = null;

	return gamePathOf(ids.planId, ids.gameId);
}

function refreshCounts(rows: readonly PlanRow[]): void {
	const uid = getUserState().user?.uid;
	if (!uid) return;
	for (const row of rows) {
		if (!row.doc) continue;
		const stamp = row.doc.lastUpdate;
		if (gameCounts.get(row.planId)?.stamp === stamp) continue;
		gameCounts.set(row.planId, { stamp, count: gameCounts.get(row.planId)?.count });
		loadGames(row.planId, uid)
			.then((games) => {
				gameCounts.set(row.planId, { stamp, count: games.length });
				m.redraw();
			})
			.catch((err: unknown) => {
				captureException(err, { operation: 'teacherHome.countGames', planId: row.planId });
				// Known-but-failed: the picker still lists the plan (picking it reads again and
				// reports its own failure); the stale stamp makes the next library update retry.
				gameCounts.set(row.planId, { stamp: FAILED_STAMP, count: null });
				m.redraw();
			});
	}
}

function renderOpenRow(w: (typeof library.lessons)[number]): m.Vnode {
	const name = rowAriaName(w);
	const given = givenNameOf(w);

	return m('li.teacher-home__row', { key: w.id, 'data-open-now': w.id }, [
		m(
			'h3.teacher-home__row-title',
			{ dir: 'auto' },
			given
				? m('bdi', { dir: 'auto' }, given)
				: [m('bdi', { dir: 'auto' }, classLabelOf(w)), ' · ', m('bdi', { dir: 'auto' }, w.title)],
		),
		renderChip(w),
		renderLessonActions(w, name),
	]);
}

function renderPlanRow(row: PlanRow): m.Vnode {
	const games = gameCounts.get(row.planId)?.count ?? 0;

	return m('li.teacher-home__row', { key: row.planId, 'data-plan': row.planId }, [
		m(
			'h3.teacher-home__row-title',
			{ dir: 'auto' },
			m(
				m.route.Link,
				{
					class: 'teacher-home__row-link',
					href: planPathOf(row.planId),
					'data-action': 'plan-open',
				},
				row.title,
			),
		),
		m('p.teacher-home__counts', t('classPlan.counts', { games, lessons: row.lessons.length })),
	]);
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
				// the first Escape clears the text; with none left it goes back a step (page handler)
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

/** "+ מערך שיעור חדש": the name form under the plans heading; it drops the lesson picker. */
function openAddPlan(): void {
	closeLessonPicker();
	resetCreate();
	startCreate();
}

/** "+ שיעור עם כיתה": the picker under the open-now heading; it drops the plan name form. */
function openAddLesson(): void {
	resetCreate();
	openLessonPicker({ rows: currentRows, countOf: (id) => gameCounts.get(id)?.count });
}

function renderOpenNow(running: ClassLessonEntry[]): m.Vnode {
	return m('section.teacher-home__open-now', { 'aria-labelledby': 'open-now-title' }, [
		m('.teacher-home__section-head', [
			m('h2.teacher-home__section-title', { id: 'open-now-title' }, t('teacher.home.open_now')),
			isPickerOpen()
				? null
				: m(
						'button.btn.btn--secondary.btn--small.teacher-home__new-lesson',
						{ type: 'button', 'data-action': 'add-lesson', onclick: () => openAddLesson() },
						t('teacher.lesson.new'),
					),
		]),
		isPickerOpen() ? m('.teacher-home__create', renderPicker()) : null,
		running.length > 0
			? m('ul.teacher-home__list', running.map(renderOpenRow))
			: m('p.teacher-home__empty', t('teacher.home.open_now_empty')),
	]);
}

function renderPlans(rows: PlanRow[]): m.Vnode {
	const filtering = rows.length > PLAN_FILTER_FROM;
	const shown = filtering ? filterLessons(rows, filterText) : rows;
	const formOpen = !isPickerNaming() && !createIdle(false);

	return m('section.teacher-home__plans', { 'aria-labelledby': 'plans-title' }, [
		m('.teacher-home__section-head', [
			m('h2.teacher-home__section-title', { id: 'plans-title' }, t('classPlan.list_title')),
			formOpen
				? null
				: m(
						'button.btn.btn--primary.btn--small.teacher-home__new',
						{ type: 'button', onclick: () => openAddPlan() },
						t('teacher.new'),
					),
		]),
		formOpen ? renderCreate(false) : null,
		filtering ? renderFilter(shown.length) : null,
		filtering && shown.length === 0
			? m('p.teacher-home__empty', t('teacher.home.filter_none'))
			: null,
		m('ul.teacher-home__list', shown.map(renderPlanRow)),
	]);
}

function renderLists(rows: PlanRow[]): m.Children {
	if (!library.ready) {
		return m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') });
	}
	// No plans yet: the name form is already open (the "+" buttons would only repeat it).
	if (rows.length === 0) return renderCreate(true);

	return [renderOpenNow(openNow(library.lessons, Date.now())), renderPlans(rows)];
}

/** Escape: the picker's list or class form steps back; the name forms step back themselves. */
function onEscape(e: KeyboardEvent): void {
	if (e.key === 'Escape' && isPickerOpen() && !isPickerNaming()) {
		e.preventDefault();
		pickerBack();

		return;
	}
	onPageEscape(e);
}

export const TeacherHome: m.Component = {
	oninit() {
		// The teacher's own screens keep the teacher's language, whatever the lesson's is.
		setFollowLessonLanguage(false);
		library = { plans: [], lessons: [], ready: false };
		closeLessonPicker();
		resetCreate();
		configureCreate({
			mode: 'plan',
			sourceCount: () => 0,
			blankAllowed: () => true,
			createNew: createPlan,
			createCopy: () => Promise.reject(new Error('a plan has no copy form')),
		});
		filterText = '';
		const uid = getUserState().user?.uid;
		if (!uid) return;
		if (unsub) unsub();
		unsub = watchLibrary(uid, (next) => {
			library = next;
			refreshCounts(buildPlanRows(next.lessons, next.plans));
			m.redraw();
		});
	},

	onremove() {
		closeLessonPicker();
		if (unsub) {
			unsub();
			unsub = null;
		}
	},

	view() {
		const rows = library.ready ? buildPlanRows(library.lessons, library.plans) : [];
		currentRows = rows;
		const emptyState = library.ready && rows.length === 0;
		const name = accountName();

		return m('.teacher-home', { onkeydown: (e: KeyboardEvent) => onEscape(e) }, [
			m('header.teacher-home__header', [
				m(BrandLogo, { size: 40, className: 'teacher-home__logo' }),
				name ? m('p.teacher-home__account', t('teacher.account', { name })) : null,
				m(
					'button.btn.btn--tertiary.btn--small.teacher-home__signout',
					{ type: 'button', onclick: () => void handleSignOut() },
					t('teacher.signout'),
				),
			]),
			m('main.teacher-home__body', [
				m('h1.teacher-home__title', t('teacher.home.title')),
				emptyState ? m('p.teacher-home__how', t('teacher.home.how')) : null,
				renderLists(rows),
			]),
			m(WizColFooter),
		]);
	},
};
