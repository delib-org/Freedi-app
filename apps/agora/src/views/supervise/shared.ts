import m from 'mithril';
import type {
	SupervisorClassRow,
	SupervisorTeacherRow,
	AgoraTeacherLessonRow,
} from '@freedi/shared-types';
import { Chart } from '../../components/Chart';
import { TeacherNav } from '../../components/TeacherNav';
import { getLang, t } from '../../lib/i18n';
import { ensureUser, getUserState } from '../../lib/user';

export function shell(title: string, body: m.Children, back = '/supervise'): m.Children {
	return m('.shell', [
		m(TeacherNav, { title, onBack: () => m.route.set(back) }),
		m('main.supervise', body),
	]);
}
export function date(ms: number): string {
	return ms ? new Date(ms).toLocaleDateString(getLang()) : '—';
}
export function privacy(): m.Children {
	return m('p.supervise__notice', t('supervise.privacy'));
}
export function periods(days: number, change: (days: number) => void): m.Children {
	return m(
		'.supervise__controls',
		[30, 90].map((n) =>
			m(
				'button.btn.btn--sm.btn--secondary',
				{ type: 'button', 'aria-pressed': n === days, onclick: () => change(n) },
				t('supervise.days', { count: n }),
			),
		),
	);
}
export function classes(rows: SupervisorClassRow[]): m.Children {
	return m(
		'.supervise__cards',
		rows.map((c) =>
			m(m.route.Link, { key: c.classId, href: `/supervise/class/${c.classId}`, class: 'card' }, [
				m('h3', c.name),
				m('p', t('roster.title', { count: c.memberCount })),
				c.advancement
					? m('p', `${t('roster.avg_class_score')}: ${c.advancement.avgClassScore ?? '—'}`)
					: null,
			]),
		),
	);
}
export function teachers(rows: SupervisorTeacherRow[], schoolId: string): m.Children {
	return m(
		'.supervise__table-wrap',
		m('table.supervise__table', [
			m(
				'thead',
				m(
					'tr',
					[
						'supervise.teacher',
						'indicator.teacher.lessonsPerWeek',
						'indicator.teacher.activeMinutes',
						'supervise.lastLesson',
					].map((k) => m('th', { scope: 'col' }, t(k))),
				),
			),
			m(
				'tbody',
				rows.map((r) =>
					m('tr', { key: r.uid }, [
						m(
							'th',
							{ scope: 'row' },
							m(
								m.route.Link,
								{ href: `/supervise/teacher/${r.uid}?schoolId=${encodeURIComponent(schoolId)}` },
								r.name,
							),
						),
						...[r.lessonsByWeek, r.minutesByWeek].map((points, i) =>
							m('td.supervise__spark', [
								m(Chart, {
									title: t(
										i ? 'indicator.teacher.activeMinutes' : 'indicator.teacher.lessonsPerWeek',
									),
									compact: true,
									spec: {
										kind: 'sparkline',
										keys: points.map((p) => p.weekStart),
										values: points.map((p) => p.value),
										slot: i ? 2 : 1,
									},
								}),
								m('span.supervise__last', String(points[points.length - 1]?.value ?? 0)),
							]),
						),
						m('td', date(r.lastLessonAt)),
					]),
				),
			),
		]),
	);
}
export function lessons(rows: AgoraTeacherLessonRow[]): m.Children {
	return m(
		'.supervise__table-wrap',
		m('table.supervise__table', [
			m(
				'thead',
				m(
					'tr',
					[
						'supervise.date',
						'supervise.duration',
						'supervise.participants',
						'indicator.series.classScore',
					].map((k) => m('th', { scope: 'col' }, t(k))),
				),
			),
			m(
				'tbody',
				rows.map((r) =>
					m('tr', { key: r.sessionId }, [
						m('th', { scope: 'row' }, date(r.playedAt)),
						m('td', Math.round(r.durationMs / 60000)),
						m('td', r.participantCount),
						m('td', r.classScoreTotal ?? '—'),
					]),
				),
			),
		]),
	);
}
export function resource<T>(
	fetcher: () => Promise<T>,
	render: (data: T) => m.Children,
): m.Component<{ id: string }> {
	let data: T | null = null;
	let error = false;
	let denied = false;
	let alive = true;
	let owner = '';
	async function load(): Promise<void> {
		error = false;
		denied = false;
		try {
			const user = await ensureUser();
			if (user.isAnonymous) {
				denied = true;

				return;
			}
			owner = user.uid;
			const next = await fetcher();
			if (alive && getUserState().user?.uid === owner) data = next;
		} catch (e) {
			if (alive) {
				error = true;
				denied = String(e).includes('permission-denied') || String(e).includes('do not supervise');
				console.error('[Supervision]', { operation: 'supervisor.load', error: e });
			}
		} finally {
			if (alive) m.redraw();
		}
	}

	return {
		oninit: () => {
			void load();
		},
		onremove: () => {
			alive = false;
		},
		view: () =>
			owner && owner !== getUserState().user?.uid
				? shell(t('supervise.title'), m('p', t('supervise.denied')))
				: data
					? render(data)
					: shell(
							t('supervise.title'),
							denied
								? m('p', t('supervise.denied'))
								: error
									? [
											m('p', { role: 'alert' }, t('supervise.error')),
											m('button.btn', { onclick: () => void load() }, t('supervise.retry')),
										]
									: m('p', { role: 'status' }, t('supervise.loading')),
						),
	};
}
