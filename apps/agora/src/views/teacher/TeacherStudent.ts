import m from 'mithril';
import { AgoraStudentAggregate, advancementSummary } from '@freedi/shared-types';
import { Icon } from '../../components/Icon';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { TeacherNav } from '../../components/TeacherNav';
import { teacherRoster } from '../../lib/callables';
import { studentContextFrom } from '../../lib/indicatorContexts';
import { getLang, t } from '../../lib/i18n';
import { classLabel, fetchTeacherClass, type TeacherClassDetail } from '../../lib/teacher';
import { memberInitial } from '../../lib/teacherHome';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { ensureUser, getUserState } from '../../lib/user';
import { skeleton } from './home/HomeSections';

/** The three numbers the tiles print themselves — the indicator grid must not repeat them */
const STATS_IN_TILES = ['student.points', 'student.avgPerGame', 'student.bestGame'];

function tile(value: string, label: string): m.Children {
	return m('.kpi', [m('span.kpi__number', value), m('span.kpi__label', label)]);
}

/**
 * One student (/teach/class/:id/student/:memberId): their achievements across
 * lessons, and — below, out of the way — the two things a teacher can do to a
 * student: a fresh PIN for a lost device, and removing them from the class.
 * Aliases only: this page never shows a real name.
 */
export function TeacherStudent(
	initialVnode: m.Vnode<{ id: string; memberId: string }>,
): m.Component<{ id: string; memberId: string }> {
	const { id: classId, memberId } = initialVnode.attrs;
	let detail: TeacherClassDetail | null = null;
	let loaded = false;
	let loadedForUid: string | null = null;
	let issuedPin: string | null = null;
	let busy = false;

	async function load(): Promise<void> {
		try {
			const user = await ensureUser();
			loadedForUid = user.uid;
			const fetched = await fetchTeacherClass(classId);
			if (getUserState().user?.uid !== user.uid) return;
			detail = fetched;
		} catch (error) {
			console.error('[Teacher] Loading the student failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	async function resetPin(): Promise<void> {
		if (busy) return;
		busy = true;
		m.redraw();
		try {
			const result = await teacherRoster({ classId, action: 'resetBinding', memberId });
			if (result.pin) issuedPin = result.pin;
		} catch (error) {
			console.error('[Teacher] Reset binding failed:', error);
		}
		busy = false;
		m.redraw();
	}

	async function remove(): Promise<void> {
		if (busy) return;
		busy = true;
		m.redraw();
		try {
			await teacherRoster({ classId, action: 'removeMember', memberId });
			m.route.set(`/teach/class/${classId}`, { tab: 'students' }, { replace: true });

			return;
		} catch (error) {
			console.error('[Teacher] Remove member failed:', error);
		}
		busy = false;
		m.redraw();
	}

	function lessonTitleOf(sessionId: string, topicPackageId: string): string {
		const topic = getTopicPackage(topicPackageId);
		if (!topic) loadTopicPackage(topicPackageId, sessionId);
		const session = detail?.sessions.find((candidate) => candidate.sessionId === sessionId);

		return (
			topic?.title ?? (session ? new Date(session.createdAt).toLocaleDateString(getLang()) : '')
		);
	}

	function lessons(career: AgoraStudentAggregate): m.Children {
		return m('section.teach-section', { 'aria-labelledby': 'student-lessons' }, [
			m('h2.sec-head__title', { id: 'student-lessons' }, t('class.tab_lessons')),
			m(
				'ul.teach-list',
				{ role: 'list' },
				career.perGame
					.slice()
					.reverse()
					.map((game) =>
						m('li', { key: game.sessionId }, [
							m(m.route.Link, { href: `/teach/report/${game.sessionId}`, class: 'teach-row' }, [
								m('span.teach-row__text', [
									m('span.teach-row__title', lessonTitleOf(game.sessionId, game.topicPackageId)),
									m(
										'span.teach-row__meta',
										new Date(game.playedAt).toLocaleDateString(getLang(), {
											day: 'numeric',
											month: 'long',
										}),
									),
								]),
								m('span.teach-row__end', String(game.points.total)),
								m('span.teach-row__go', m(Icon, { name: 'arrow', size: 18 })),
							]),
						]),
					),
			),
		]);
	}

	function management(alias: string): m.Children {
		return m('section.teach-card', [
			m('h2.teach-card__title', t('teach.student_manage')),
			issuedPin
				? m('.roster__pin-note', [
						m('span.roster__pin-value', issuedPin),
						m('span.home-explanation', t('roster.pin_note')),
					])
				: null,
			m('.roster__actions', [
				m(
					'button.btn.btn--sm.btn--secondary',
					{ type: 'button', disabled: busy, onclick: () => void resetPin() },
					t('roster.reset_pin'),
				),
				m(
					'button.btn.btn--sm.btn--ghost',
					{
						type: 'button',
						disabled: busy,
						onclick: () => {
							if (window.confirm(t('roster.remove_confirm', { alias }))) void remove();
						},
					},
					t('roster.remove'),
				),
			]),
		]);
	}

	void load();

	return {
		view() {
			const { loading, tier, user } = getUserState();
			if (user && loadedForUid !== null && loadedForUid !== user.uid) {
				loadedForUid = user.uid;
				detail = null;
				loaded = false;
				void load();
			}
			const back = (): void => m.route.set(`/teach/class/${classId}`, { tab: 'students' });
			const member = detail?.members.find((candidate) => candidate.memberId === memberId);
			if (loading || !loaded) {
				return m('.shell', [
					m(TeacherNav, { title: '', onBack: back }),
					m('.shell__content.teach-page', skeleton()),
				]);
			}
			if (tier !== 2 || !detail || !member) {
				return m('.shell', [
					m(TeacherNav, { title: '', onBack: () => m.route.set(`/teach/class/${classId}`) }),
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('teach.student_not_found')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set(`/teach/class/${classId}`) },
							t('common.back'),
						),
					]),
				]);
			}
			const career = detail.careers.get(memberId) ?? null;
			const classGames = detail.aggregate ? advancementSummary(detail.aggregate).gamesPlayed : 0;

			return m('.shell', [
				m(TeacherNav, { title: member.alias, onBack: back }),
				m('.shell__content.teach-page', [
					m('span.crumb', t('teach.student_crumb', { class: classLabel(detail) })),
					m('.student-hero', [
						m('span.avatar.avatar--lg', { 'aria-hidden': 'true' }, memberInitial(member.alias)),
						m('div', [
							m('h2.student-hero__name', member.alias),
							m(
								'span.teach-note',
								t('teach.joined_on', {
									date: new Date(member.joinedAt).toLocaleDateString(getLang(), {
										day: 'numeric',
										month: 'long',
									}),
								}),
							),
						]),
					]),
					career && career.gamesPlayed > 0
						? [
								m('.kpis', [
									tile(String(career.totals.total), t('teach.kpi_points')),
									tile(String(career.gamesPlayed), t('teach.kpi_lessons')),
									tile(String(career.totals.proposals), t('teach.kpi_proposals')),
								]),
								m('section.teach-card', [
									m('h2.teach-card__title', t('teach.best_lesson')),
									m(
										'span.teach-card__meta',
										t('roster.points', { points: String(career.bestGameTotal) }),
									),
								]),
								m('section.teach-card', [
									m('h2.teach-card__title', t('teach.helping')),
									m(
										'span.teach-card__meta',
										t('teach.thanks_received', { n: String(career.totals.helping ?? 0) }),
									),
								]),
								m(IndicatorGrid<'student'>, {
									scope: 'student',
									context: studentContextFrom(career, classGames),
									options: { hide: STATS_IN_TILES },
									compact: true,
								}),
								lessons(career),
							]
						: m('.teach-empty', [m('p', t('teach.student_empty'))]),
					management(member.alias),
				]),
			]);
		},
	};
}
