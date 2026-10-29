import m from 'mithril';
import '@/styles/teacher.scss';
import { getRandomUID } from '@freedi/shared-types';
import type { ClassGame, ClassPlan } from '@freedi/shared-types';
import { getUserState } from '@/lib/user';
import { getLang, t } from '@/lib/i18n';
import { setFollowLessonLanguage } from '@/lib/store';
import { WizColFooter } from '@/components/WizColFooter';
import type { Unsubscribe } from '@/lib/firebase';
import { loadGames, renamePlan, subscribeToGames, writeGame } from '@/lib/classPlans';
import { classSnapshotGame } from '@/lib/classroom/api';
import { cleaned, emptySnapshot } from '@/lib/classroom/gameSnapshotEdit';
import { gamePathOf } from '@/lib/lessonLinks';
import {
	FILTER_ALL,
	FILTER_NO_CLASS,
	buildPlanRows,
	classesOf,
	copySources,
	gameSections,
	lessonsOfClass,
	showsClassFilter,
	type CopySource,
	type GameSection,
	type PlanRow,
} from '@/lib/planTree';
import { watchLibrary, type TeacherLibrary } from '@/lib/teacherLibrary';
import { NotYourLesson } from './NotYourLesson';
import { renderChip, renderLessonActions, renderLessonName, classLabelOf } from './LessonRow';
import { ClassForm, closeClassForm, isClassFormOpen, openClassForm } from './ClassForm';
import {
	configureCreate,
	createIdle,
	onPageEscape,
	pickRow,
	picking,
	renderCreate,
	resetCreate,
	startCreate,
} from './HomeCreate';
import { filterLessons } from './homeHelpers';

/**
 * The lesson plan screen, `/t/:planId` under `/t/plans` (docs/ia/join-class-lesson-plan.md 5, 7):
 * the plan's name (renamed in place), one section per game with "תכנון השאלות", "+ שיעור עם כיתה"
 * and the lessons played from it (newest first, with a class filter at two or more classes),
 * and "+ משחק חדש" at the end. An old lesson shows here as a plan of its own.
 */

const FILTER_FROM = 10;

let planId = '';
let library: TeacherLibrary = { plans: [], lessons: [], ready: false };
let plan: ClassPlan | null = null;
let planLoaded = false;
let games: ClassGame[] = [];
let gamesLoaded = false;
let gamesDenied = false;
let stops: Unsubscribe[] = [];
let classFilter = FILTER_ALL;
let renaming = false;
let renameText = '';
let renameFailed = false;
let pickFilter = '';
/** Sources for "questions from another game", loaded when the pick step opens. */
let sources: CopySource[] = [];
let sourcesLoad: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
/** The id of the game being made, kept until it succeeds so a retry reuses it. */
let pendingGameId: string | null = null;

function uid(): string {
	return getUserState().user?.uid ?? '';
}

function row(): PlanRow | undefined {
	return buildPlanRows(library.lessons, library.plans).find((r) => r.planId === planId);
}

/** The plan exists as a doc of this teacher. An old lesson that is only a plan so far has none. */
const hasPlanDoc = (): boolean => plan !== null;

// ---- creating a game --------------------------------------------------------------

function nextOrder(): number {
	return games.reduce((max, g) => Math.max(max, g.order + 1), 0);
}

async function createBlankGame(title: string): Promise<string> {
	const gameId = pendingGameId ?? getRandomUID();
	pendingGameId = gameId;
	await writeGame({
		planId,
		gameId,
		title,
		order: nextOrder(),
		snapshot: emptySnapshot(getLang()),
		ownerUid: uid(),
	});
	pendingGameId = null;

	return gamePathOf(planId, gameId);
}

async function copyGame(sourceId: string, title: string, newId: string): Promise<string> {
	const source = sources.find((s) => s.id === sourceId);
	if (!source) throw new Error('the source is gone');
	if (source.kind === 'lesson' || !source.game) {
		const res = await classSnapshotGame({
			sourceMainId: source.id,
			planId,
			newGameId: newId,
			title,
		});

		return gamePathOf(res.planId, res.gameId);
	}
	await writeGame({
		planId,
		gameId: newId,
		title,
		order: nextOrder(),
		snapshot: cleaned(source.game.snapshot),
		ownerUid: uid(),
	});

	return gamePathOf(planId, newId);
}

/** Loads every plan's games once the pick step opens (the list groups them by plan). */
async function loadSources(): Promise<void> {
	if (sourcesLoad === 'loading' || sourcesLoad === 'ready') return;
	sourcesLoad = 'loading';
	m.redraw();
	try {
		const rows = buildPlanRows(library.lessons, library.plans);
		// a plan with no doc of its own yet (an old lesson) can only add that lesson's questions
		const eligible = hasPlanDoc() ? rows : rows.filter((r) => r.planId === planId);
		const byPlan = new Map<string, ClassGame[]>();
		for (const r of eligible) {
			if (r.doc) byPlan.set(r.planId, await loadGames(r.planId, uid()));
		}
		const all = copySources(eligible, byPlan);
		sources = hasPlanDoc() ? all : all.filter((s) => s.kind === 'lesson' && s.id === planId);
		sourcesLoad = 'ready';
	} catch (err) {
		console.error('[PlanOverview] loading the copy sources failed:', err);
		sourcesLoad = 'error';
	} finally {
		m.redraw();
	}
}

// ---- rename -----------------------------------------------------------------------

async function commitRename(): Promise<void> {
	const title = renameText.trim();
	if (!title || !plan || title === plan.title) {
		renaming = false;

		return;
	}
	renameFailed = false;
	try {
		await renamePlan(planId, title);
		renaming = false;
	} catch (err) {
		console.error('[PlanOverview] rename failed:', err);
		renameFailed = true;
	} finally {
		m.redraw();
	}
}

function renderTitle(title: string): m.Children {
	if (renaming) {
		return m(
			'form.plan-overview__rename',
			{
				onsubmit: (e: Event) => {
					e.preventDefault();
					void commitRename();
				},
			},
			[
				m('input.teacher-home__input', {
					type: 'text',
					value: renameText,
					maxlength: 200,
					'aria-label': t('classPlan.rename'),
					oncreate: (vn: m.VnodeDOM) => (vn.dom as HTMLInputElement).focus(),
					oninput: (e: Event) => {
						renameText = (e.target as HTMLInputElement).value;
					},
				}),
				m('button.btn.btn--primary.btn--small', { type: 'submit' }, t('plan.save')),
				m(
					'button.btn.btn--tertiary.btn--small',
					{ type: 'button', onclick: () => (renaming = false) },
					t('teacher.new.cancel'),
				),
				renameFailed ? m('p.teacher-home__error', { role: 'alert' }, t('plan.error.save')) : null,
			],
		);
	}

	return [
		m('h1.plan-overview__title', { dir: 'auto' }, title),
		hasPlanDoc()
			? m(
					'button.btn.btn--tertiary.btn--small',
					{
						type: 'button',
						'data-action': 'rename',
						onclick: () => {
							renameText = title;
							renaming = true;
						},
					},
					t('classPlan.rename'),
				)
			: null,
	];
}

// ---- sections ---------------------------------------------------------------------

function renderLesson(l: PlanRow['lessons'][number]): m.Vnode {
	const name = `${classLabelOf(l)} · ${l.title}`;

	return m('li.teacher-home__row.plan-overview__lesson', { key: l.id, 'data-lesson': l.id }, [
		m('h3.teacher-home__row-title', { dir: 'auto' }, renderLessonName(l)),
		renderChip(l),
		renderLessonActions(l, name),
	]);
}

function renderSection(section: GameSection, filtered: PlanRow['lessons']): m.Vnode {
	const lessons = filtered.filter((l) => l.link.gameId === section.gameId);
	const questionsPath = section.game
		? gamePathOf(planId, section.gameId)
		: `/t/${section.gameId}/plan`;

	return m('section.plan-overview__game', { key: section.gameId, 'data-game': section.gameId }, [
		m('h2.plan-overview__game-title', { dir: 'auto' }, section.title),
		m('.plan-overview__game-actions', [
			m(
				m.route.Link,
				{ class: 'btn btn--secondary btn--small', href: questionsPath, 'data-action': 'plan' },
				t('teacher.row.plan'),
			),
			// a game that is only an old lesson has no game doc yet: no "+ lesson" until it has one
			section.game
				? m(
						'button.btn.btn--primary.btn--small',
						{
							type: 'button',
							'data-action': 'new-lesson',
							onclick: () => openClassForm(section.gameId),
						},
						t('teacher.lesson.new'),
					)
				: null,
		]),
		section.game && isClassFormOpen(section.gameId)
			? m(ClassForm, { planId, gameId: section.gameId })
			: null,
		lessons.length > 0
			? m('ul.teacher-home__list', lessons.map(renderLesson))
			: m('p.teacher-home__empty', t('game.no_lessons')),
	]);
}

function renderClassFilter(all: PlanRow['lessons']): m.Children {
	if (!showsClassFilter(all)) return null;

	return m('.plan-overview__filter', [
		m(
			'select.plan-card__text',
			{
				'aria-label': t('classPlan.filter_all'),
				value: classFilter,
				onchange: (e: Event) => {
					classFilter = (e.target as HTMLSelectElement).value;
				},
			},
			[
				m('option', { value: FILTER_ALL }, t('classPlan.filter_all')),
				...classesOf(all).map((c) =>
					m(
						'option',
						{ value: c.id, dir: 'auto' },
						c.id === FILTER_NO_CLASS ? t('teacher.lesson.class_none') : c.name,
					),
				),
			],
		),
	]);
}

function renderPickList(): m.Children {
	if (sourcesLoad === 'loading' || sourcesLoad === 'idle') {
		return m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') });
	}
	if (sourcesLoad === 'error') {
		return m('.teacher-home__error', { role: 'alert' }, [
			m('span', t('teacher.copy.failed')),
			m(
				'button.btn.btn--tertiary.btn--small',
				{
					type: 'button',
					onclick: () => {
						sourcesLoad = 'idle';
						void loadSources();
					},
				},
				t('plan.error.retry'),
			),
		]);
	}
	const filtering = sources.length > FILTER_FROM;
	const shown = filtering ? filterLessons(sources, pickFilter) : sources;
	const planIds = [...new Set(shown.map((s) => s.planId))];

	return [
		filtering
			? m('input.teacher-home__filter', {
					type: 'search',
					value: pickFilter,
					placeholder: t('teacher.home.filter'),
					'aria-label': t('teacher.home.filter'),
					oninput: (e: Event) => {
						pickFilter = (e.target as HTMLInputElement).value;
					},
				})
			: null,
		m(
			'.plan-overview__pick-groups',
			planIds.map((id) => {
				const group = shown.filter((s) => s.planId === id);

				return m('section.plan-overview__pick-group', { key: id }, [
					m('h2.teacher-home__section-title', { dir: 'auto' }, group[0].planTitle),
					m(
						'ul.teacher-home__list',
						{ 'aria-labelledby': 'pick-lead' },
						group.map((s) =>
							m('li.teacher-home__row', { key: s.id }, [
								m('h3.teacher-home__row-title', { dir: 'auto' }, s.title),
								m('.teacher-home__row-actions', [
									m(
										'button.btn.btn--primary.btn--small',
										{
											type: 'button',
											'data-action': 'pick',
											'data-id': s.id,
											'aria-label': t('teacher.row.for', {
												action: t('teacher.row.pick'),
												name: s.title,
											}),
											onclick: () => pickRow(s.id, s.title),
										},
										t('teacher.row.pick'),
									),
								]),
							]),
						),
					),
				]);
			}),
		),
	];
}

function sourceCount(): number {
	const own = row();

	return games.length + (own?.lessons.filter((l) => l.link.legacy).length ?? 0);
}

export const PlanOverview: m.Component = {
	oninit() {
		setFollowLessonLanguage(false);
		planId = m.route.param('planId') ?? '';
		library = { plans: [], lessons: [], ready: false };
		plan = null;
		planLoaded = false;
		games = [];
		gamesLoaded = false;
		gamesDenied = false;
		classFilter = FILTER_ALL;
		renaming = false;
		sources = [];
		sourcesLoad = 'idle';
		pendingGameId = null;
		resetCreate();
		closeClassForm();
		configureCreate({
			mode: 'game',
			sourceCount,
			blankAllowed: hasPlanDoc,
			createNew: createBlankGame,
			createCopy: copyGame,
		});
		const user = uid();
		if (!planId || !user) return;
		stops = [
			watchLibrary(user, (next) => {
				library = next;
				// the plan doc comes from the teacher's own list: a plan that is not theirs (or only an
				// old lesson) is simply not in it, with no denied read to retry
				plan = next.plans.find((p) => p.planId === planId) ?? null;
				planLoaded = next.ready;
				m.redraw();
			}),
			subscribeToGames(
				planId,
				user,
				(list) => {
					games = list;
					gamesLoaded = true;
					m.redraw();
				},
				() => {
					gamesDenied = true;
					gamesLoaded = true;
					m.redraw();
				},
			),
		];
	},

	onremove() {
		for (const stop of stops) stop();
		stops = [];
		closeClassForm();
	},

	view() {
		const loaded = library.ready && planLoaded && gamesLoaded;
		const own = row();
		// not ours: no plan doc and no old lesson standing for it
		if (loaded && ((!plan && !own) || (gamesDenied && !plan))) return m(NotYourLesson);
		const title = plan?.title ?? own?.title ?? '';
		const lessons = own?.lessons ?? [];
		const filtered = lessonsOfClass(lessons, classFilter);
		const sections = gameSections(games, lessons);
		const emptyState = loaded && sections.length === 0;
		const isPicking = picking();
		if (isPicking && sourcesLoad === 'idle') void loadSources();

		return m('.teacher-home.plan-overview', { onkeydown: (e: KeyboardEvent) => onPageEscape(e) }, [
			m('header.teacher-home__header', [
				m(m.route.Link, { class: 'plan__back', href: '/t' }, [
					m('span.plan__back-chevron', { 'aria-hidden': 'true' }, '‹'),
					m('span', t('classPlan.back')),
				]),
			]),
			m('main.teacher-home__body', [
				loaded
					? m('.plan-overview__head', renderTitle(title))
					: m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }),
				loaded ? renderClassFilter(lessons) : null,
				loaded && !isPicking ? sections.map((s) => renderSection(s, filtered)) : null,
				loaded && isPicking ? renderPickList() : null,
				loaded && !createIdle(emptyState)
					? renderCreate(emptyState)
					: loaded
						? m(
								'button.btn.btn--secondary.teacher-home__new',
								{ type: 'button', 'data-action': 'new-game', onclick: () => startCreate() },
								t('game.new'),
							)
						: null,
			]),
			m(WizColFooter),
		]);
	},
};
