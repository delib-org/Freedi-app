import m from 'mithril';
import { AgoraSession } from '@freedi/shared-types';
import { TeacherNav } from '../../components/TeacherNav';
import { t } from '../../lib/i18n';
import { lessonClassName, lessonTitle } from '../../lib/lessonLabels';
import { fetchSessionHistory, listTopicPackages } from '../../lib/teacher';
import { lessonSearchText, matchesLessonSearch } from '../../lib/teacherHome';
import { getTeacherNavState, isSessionLive, loadTeacherNav } from '../../lib/teacherNav';
import { getTopicPackage } from '../../lib/topic';
import { getUserState } from '../../lib/user';
import { sectionError, skeleton } from './home/HomeSections';
import { monthGroups } from './class/ClassLessons';

/** A page of history is this many lessons (see fetchSessionHistory) */
const PAGE = 25;
/** A search reads at most this many pages (500 lessons) before it stops and says so */
const SEARCH_PAGE_CAP = 20;

/**
 * Past lessons (/teach/lessons): every lesson this teacher has run, newest
 * first, grouped by month. A search or a class filter reads the whole history
 * page after page until it has enough matches — it does not stop at the pages
 * that happened to be loaded. Reached from the ≡ menu, and from a class's
 * "search all past lessons" with the class already chosen.
 */
export function PastLessons(): m.Component {
	let sessions: AgoraSession[] = [];
	let cursor: Awaited<ReturnType<typeof fetchSessionHistory>>['cursor'];
	let more = true;
	let loading = false;
	let failed = false;
	let started = false;
	let loadedFor: string | null = null;
	let query = '';
	let classFilter = m.route.param('class') ?? '';
	/** The teacher's own scenario titles, so a search can match words in them without waiting on a read per lesson */
	let titles = new Map<string, string>();
	let pagesRead = 0;

	function titleOf(session: AgoraSession): string {
		return (
			titles.get(session.topicPackageId) ??
			getTopicPackage(session.topicPackageId)?.title ??
			lessonTitle(session) ??
			''
		);
	}

	function classes(): ReadonlyArray<{ classId: string; name: string; gradeLevel?: string }> {
		return getTeacherNavState().classes;
	}

	function matches(session: AgoraSession): boolean {
		if (isSessionLive(session)) return false;
		if (classFilter && session.classId !== classFilter) return false;

		return matchesLessonSearch(
			lessonSearchText(session, titleOf(session), lessonClassName(session, classes())),
			query,
		);
	}

	function filtering(): boolean {
		return query.trim() !== '' || classFilter !== '';
	}

	async function loadPage(): Promise<void> {
		const uid = getUserState().user?.uid;
		if (!uid || loading || !more) return;
		loading = true;
		failed = false;
		m.redraw();
		try {
			const page = await fetchSessionHistory(uid, cursor);
			if (getUserState().user?.uid !== uid) return;
			sessions = [...sessions, ...page.sessions];
			cursor = page.cursor;
			more = page.hasMore;
			pagesRead += 1;
			started = true;
		} catch (error) {
			console.error('[Lessons] Loading past lessons failed:', error);
			failed = true;
		} finally {
			loading = false;
			m.redraw();
		}
	}

	/** While a search or a class is chosen, keep reading until a page's worth matches or the history ends */
	async function fillForFilter(): Promise<void> {
		while (filtering() && more && !failed && pagesRead < SEARCH_PAGE_CAP) {
			if (sessions.filter(matches).length >= PAGE) return;
			await loadPage();
		}
	}

	async function start(): Promise<void> {
		const uid = getUserState().user?.uid;
		if (!uid) return;
		loadedFor = uid;
		loadTeacherNav();
		void listTopicPackages(uid)
			.then((own) => {
				titles = new Map(own.map((pkg) => [pkg.topicPackageId, pkg.title]));
				m.redraw();
			})
			.catch((error: unknown) => console.error('[Lessons] Loading scenario titles failed:', error));
		await loadPage();
		await fillForFilter();
	}

	function onFilterChange(): void {
		void fillForFilter();
	}

	function controls(): m.Children {
		return m('.find-bar', [
			m('input.text-input.find-bar__input', {
				type: 'search',
				value: query,
				'aria-label': t('teach.lessons_search'),
				placeholder: t('teach.lessons_search'),
				oninput: (event: InputEvent) => {
					query = (event.target as HTMLInputElement).value;
					onFilterChange();
				},
			}),
			m(
				'select.text-input',
				{
					'aria-label': t('teach.lessons_all_classes'),
					value: classFilter,
					onchange: (event: Event) => {
						classFilter = (event.target as HTMLSelectElement).value;
						onFilterChange();
					},
				},
				[
					m('option', { value: '' }, t('teach.lessons_all_classes')),
					...classes().map((agoraClass) =>
						m(
							'option',
							{ value: agoraClass.classId },
							lessonClassName({ classId: agoraClass.classId }, classes()),
						),
					),
				],
			),
		]);
	}

	function results(): m.Children {
		if (failed && sessions.length === 0) return sectionError(() => void start());
		if (!started) return skeleton();
		const shown = sessions.filter(matches);
		if (shown.length === 0 && !loading && !more) {
			return m('.teach-empty', [
				m('p', t(filtering() ? 'teach.lessons_none_match' : 'teach.lessons_none')),
			]);
		}

		return [
			monthGroups(shown, isSessionLive, (session) => lessonClassName(session, classes())),
			loading && filtering()
				? m('p.teach-note', { role: 'status' }, t('teach.lessons_searching'))
				: null,
			failed ? sectionError(() => void loadPage()) : null,
			more && !failed && !filtering()
				? m(
						'button.btn.btn--secondary.lessons-more',
						{ type: 'button', disabled: loading, onclick: () => void loadPage() },
						t(loading ? 'teach.lessons_loading' : 'teach.lessons_more'),
					)
				: null,
		];
	}

	return {
		view() {
			const { tier, loading: authLoading, user } = getUserState();
			if (user && !user.isAnonymous && loadedFor !== user.uid) {
				loadedFor = user.uid;
				sessions = [];
				cursor = undefined;
				more = true;
				started = false;
				pagesRead = 0;
				void start();
			}
			if (authLoading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2) {
				m.route.set('/teach');

				return null;
			}

			return m('.shell', [
				m(TeacherNav, {
					title: t('dashboard.my_games'),
					onBack: () =>
						m.route.set(classFilter ? `/teach/class/${classFilter}?tab=lessons` : '/teach'),
				}),
				m('.shell__content.teach-page', [
					m('p.teach-note', t('teach.lessons_hint')),
					controls(),
					m('section.teach-section', { 'aria-label': t('dashboard.my_games') }, results()),
				]),
			]);
		},
	};
}
