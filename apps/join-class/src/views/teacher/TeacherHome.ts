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

/** A name filter appears above this many plans (IA 8). */
const FILTER_FROM = 10;

let library: TeacherLibrary = { plans: [], lessons: [], ready: false };
let unsub: Unsubscribe | null = null;
let filterText = '';
/** Games per plan, read once per plan change (the plan doc's `lastUpdate` moves when a game is added). */
const gameCounts = new Map<string, { stamp: number; count: number }>();
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
		gameCounts.set(row.planId, { stamp, count: gameCounts.get(row.planId)?.count ?? 0 });
		loadGames(row.planId, uid)
			.then((games) => {
				gameCounts.set(row.planId, { stamp, count: games.length });
				m.redraw();
			})
			.catch((err: unknown) => {
				captureException(err, { operation: 'teacherHome.countGames', planId: row.planId });
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

function renderLists(rows: PlanRow[]): m.Children {
	if (!library.ready) {
		return m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') });
	}
	const filtering = rows.length > FILTER_FROM;
	const shown = filtering ? filterLessons(rows, filterText) : rows;
	const running = openNow(library.lessons, Date.now());

	return [
		running.length > 0
			? m('section.teacher-home__open-now', { 'aria-labelledby': 'open-now-title' }, [
					m('h2.teacher-home__section-title', { id: 'open-now-title' }, t('teacher.home.open_now')),
					m('ul.teacher-home__list', running.map(renderOpenRow)),
				])
			: null,
		rows.length > 0
			? m('section.teacher-home__plans', { 'aria-labelledby': 'plans-title' }, [
					m('h2.teacher-home__section-title', { id: 'plans-title' }, t('classPlan.list_title')),
					filtering ? renderFilter(shown.length) : null,
					filtering && shown.length === 0
						? m('p.teacher-home__empty', t('teacher.home.filter_none'))
						: null,
					m('ul.teacher-home__list', shown.map(renderPlanRow)),
				])
			: null,
	];
}

export const TeacherHome: m.Component = {
	oninit() {
		// The teacher's own screens keep the teacher's language, whatever the lesson's is.
		setFollowLessonLanguage(false);
		library = { plans: [], lessons: [], ready: false };
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
		if (unsub) {
			unsub();
			unsub = null;
		}
	},

	view() {
		const rows = library.ready ? buildPlanRows(library.lessons, library.plans) : [];
		const emptyState = library.ready && rows.length === 0;
		const name = accountName();

		return m('.teacher-home', { onkeydown: (e: KeyboardEvent) => onPageEscape(e) }, [
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
				library.ready && !createIdle(emptyState)
					? renderCreate(emptyState)
					: library.ready
						? m(
								'button.btn.btn--primary.teacher-home__new',
								{ type: 'button', onclick: () => startCreate() },
								t('teacher.new'),
							)
						: null,
				renderLists(rows),
			]),
			m(WizColFooter),
		]);
	},
};
