import m from 'mithril';
import { Icon } from '../../components/Icon';
import { Segment } from '../../components/Segment';
import { TeacherNav } from '../../components/TeacherNav';
import { t } from '../../lib/i18n';
import { classLabel, fetchTeacherClass, type TeacherClassDetail } from '../../lib/teacher';
import { isSessionLive, navClass } from '../../lib/teacherNav';
import { ensureUser, getUserState } from '../../lib/user';
import { skeleton } from './home/HomeSections';
import { ClassAchievements } from './class/ClassAchievements';
import { monthGroups } from './class/ClassLessons';
import { ClassSettings } from './class/ClassSettings';
import { ClassStudents } from './class/ClassStudents';

type ClassTab = 'achievements' | 'students' | 'lessons';

const TABS: readonly ClassTab[] = ['achievements', 'students', 'lessons'];

function tabFromRoute(): ClassTab {
	const asked = m.route.param('tab');

	return TABS.find((tab) => tab === asked) ?? 'achievements';
}

/**
 * One class (/teach/class/:id), in three sections: its achievements (the
 * first thing a teacher opens a class for), its students, and its lessons.
 * The class's own settings — code, name, teachers, archive — wait behind the
 * cog. Careers are read from the server-materialised aggregate docs; this
 * screen derives nothing.
 */
export function TeacherClass(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const classId = initialVnode.attrs.id;
	let detail: TeacherClassDetail | null = null;
	let loaded = false;
	/**
	 * The account `detail` was read for. A credential-recovery sign-in swaps
	 * the uid under the open page; the previous account's roster is then not
	 * this one's to show, so it is dropped and read again.
	 */
	let loadedForUid: string | null = null;
	let settingsOpen = false;

	async function load(): Promise<void> {
		try {
			const user = await ensureUser();
			loadedForUid = user.uid;
			const fetched = await fetchTeacherClass(classId);
			if (getUserState().user?.uid !== user.uid) return;
			detail = fetched;
		} catch (error) {
			console.error('[Teacher] Loading class failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	/** Drop and re-read the class when auth settles on another account */
	function reloadIfAccountChanged(uid: string | undefined): void {
		if (!uid || loadedForUid === null || loadedForUid === uid) return;
		loadedForUid = uid;
		detail = null;
		loaded = false;
		settingsOpen = false;
		void load();
	}

	function selectTab(tab: ClassTab): void {
		m.route.set(`/teach/class/${classId}`, { tab }, { replace: true });
	}

	function section(tab: ClassTab, current: TeacherClassDetail | null): m.Children {
		if (!current) return skeleton();
		if (tab === 'students') return m(ClassStudents, { classId, detail: current });
		if (tab === 'lessons') {
			if (current.sessions.length === 0) {
				return m('.teach-empty', [m('p', t('teach.no_lessons_class'))]);
			}

			return [
				monthGroups(current.sessions, isSessionLive),
				m(
					m.route.Link,
					{ href: `/teach/lessons?class=${classId}`, class: 'teach-link' },
					t('teach.search_all_lessons'),
					m(Icon, { name: 'arrow', size: 16 }),
				),
			];
		}

		return m(ClassAchievements, { detail: current });
	}

	void load();

	return {
		view() {
			const { tier, loading, user } = getUserState();
			reloadIfAccountChanged(user?.uid);
			/**
			 * The teacher's menu passed this way already and remembers the name —
			 * the one thing a teacher opening a class wants on screen at once.
			 * Shown from the cache, the page is never blank, and only the
			 * sections wait.
			 */
			const cached = navClass(classId);
			const known = detail ?? cached;
			if (loading || (!loaded && !known)) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2 || !known || (loaded && !detail)) {
				return m('.shell', [
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('roster.not_found')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set('/teach') },
							t('common.back'),
						),
					]),
				]);
			}

			const tab = tabFromRoute();

			return m('.shell', [
				m(TeacherNav, {
					title: classLabel(known),
					subtitle: detail?.schoolName ?? '',
					onBack: () => m.route.set('/teach'),
					trailing: m(
						'button.teacher-nav__cog',
						{
							type: 'button',
							// The cog opens the class's own settings, and those are
							// the console's answer — no point offering it early
							disabled: !detail,
							'aria-expanded': String(settingsOpen),
							'aria-label': t('teach.class_settings'),
							title: t('teach.class_settings'),
							class: settingsOpen ? 'teacher-nav__cog--on' : undefined,
							onclick: () => {
								settingsOpen = !settingsOpen;
							},
						},
						m(Icon, { name: 'cog', size: 20 }),
					),
				}),
				m('.shell__content.teach-page', [
					settingsOpen && detail
						? m(ClassSettings, {
								classId,
								detail,
								onDetail: (fresh) => {
									detail = fresh;
								},
								onClose: () => {
									settingsOpen = false;
								},
							})
						: null,
					m(
						'button.btn.btn--primary.btn--full.btn--lg',
						{ type: 'button', onclick: () => m.route.set(`/teach/start?classId=${classId}`) },
						t('roster.start_with_class'),
					),
					m(Segment, {
						ariaLabel: t('class.tabs_aria'),
						selected: tab,
						sticky: true,
						idPrefix: 'class',
						onSelect: (id) => selectTab(id as ClassTab),
						options: TABS.map((id) => ({ id, label: t(`class.tab_${id}`) })),
					}),
					m(
						'.teach-section',
						{ id: 'class-panel', role: 'tabpanel', 'aria-labelledby': `class-tab-${tab}` },
						section(tab, detail),
					),
				]),
			]);
		},
	};
}
