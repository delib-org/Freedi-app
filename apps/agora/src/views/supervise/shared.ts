import m from 'mithril';
import { dayKey, formatMinutes, OUTCOME_ORDER, type Slot } from '@freedi/shared-charts';
import type {
	AgoraSessionOutcome,
	AgoraTeacherLessonRow,
	SupervisorTeacherRow,
} from '@freedi/shared-types';
import { Chart } from '../../components/Chart';
import { TeacherNav } from '../../components/TeacherNav';
import { getLang, t } from '../../lib/i18n';
import { ensureUser, getUserState, signInWithGoogle } from '../../lib/user';
import {
	isDeniedError,
	SUPERVISE_PERIODS,
	type SupervisePeriod,
	type SupervisorClassView,
} from '../../lib/supervisor';

export interface ShellOptions {
	back?: string;
	subtitle?: string;
	trailing?: m.Children;
}

/** Every supervisor screen: the teacher bar on top, the page under it */
export function shell(title: string, body: m.Children, opts: ShellOptions = {}): m.Children {
	return m('.shell', [
		m(TeacherNav, {
			title,
			subtitle: opts.subtitle,
			onBack: () => m.route.set(opts.back ?? '/supervise'),
			trailing: opts.trailing,
		}),
		m('main.supervise', body),
	]);
}

export function date(ms: number): string {
	return ms ? new Date(ms).toLocaleDateString(getLang()) : t('supervise.never');
}

/** "1 h 12 min" from milliseconds; "0 min" when nothing happened */
export function duration(ms: number): string {
	const { h, m: minutes } = formatMinutes(ms);
	const parts: string[] = [];
	if (h > 0) parts.push(t('chart.hours_unit', { h }));
	if (minutes > 0 || h === 0) parts.push(t('chart.minutes_unit', { m: minutes }));

	return parts.join(' ');
}

export function privacy(): m.Children {
	return m('p.supervise__notice', t('supervise.privacy'));
}

export function section(title: string, body: m.Children): m.Children {
	return m('section.supervise__section', [m('h2.supervise__section-title', title), body]);
}

function toggle<T extends string | number>(
	options: readonly T[],
	current: T,
	label: (o: T) => string,
	change: (o: T) => void,
): m.Children {
	return m(
		'.supervise__toggle',
		{ role: 'group' },
		options.map((o) =>
			m(
				'button.btn.btn--sm.btn--secondary',
				{
					key: String(o),
					type: 'button',
					'aria-pressed': String(o === current),
					onclick: () => change(o),
				},
				label(o),
			),
		),
	);
}

export function periodToggle(
	days: SupervisePeriod,
	change: (d: SupervisePeriod) => void,
): m.Children {
	return toggle(SUPERVISE_PERIODS, days, (d) => t(`supervise.days_${d}`), change);
}

export function granularityToggle(
	granularity: 'day' | 'week',
	change: (g: 'day' | 'week') => void,
): m.Children {
	return toggle(['day', 'week'] as const, granularity, (g) => t(`supervise.by_${g}`), change);
}

/** An outcome as a small pill with the registry's icon and colour */
export function outcomePill(outcome: AgoraSessionOutcome | undefined): m.Children {
	const key = outcome ?? 'unscored';
	const entry = OUTCOME_ORDER.find((o) => o.key === key);

	return m('span.supervise__pill', { class: `supervise__pill--${key}` }, [
		m('span', { 'aria-hidden': 'true' }, entry?.icon ?? ''),
		t(`indicator.outcome.${key}`),
	]);
}

/** A sparkline in a table cell, with its last value printed for the narrowest phones */
export function sparkCell(
	title: string,
	points: Array<{ key: string; value: number }>,
	slot: Slot,
	label: string,
): m.Children {
	const last = points[points.length - 1]?.value ?? 0;

	return m('td.supervise__spark', { 'data-label': label }, [
		m(Chart, {
			title,
			compact: true,
			spec: {
				kind: 'sparkline',
				keys: points.map((p) => p.key),
				values: points.map((p) => p.value),
				slot,
			},
		}),
		m('span.supervise__last', new Intl.NumberFormat(getLang()).format(Math.round(last))),
	]);
}

export function cell(label: string, content: m.Children): m.Children {
	return m('td', { 'data-label': label }, content);
}

function table(headers: string[], rows: m.Children[]): m.Children {
	return m(
		'.supervise__table-wrap',
		m('table.supervise__table', [
			m(
				'thead',
				m(
					'tr',
					headers.map((h) => m('th', { scope: 'col' }, h)),
				),
			),
			m('tbody', rows),
		]),
	);
}

/** The school's teachers: who, how many classes, two sparklines, when last seen */
export function teachersTable(rows: SupervisorTeacherRow[], schoolId: string): m.Children {
	if (rows.length === 0) return m('p.supervise__empty', t('supervise.no_teachers'));
	const lessons = t('supervise.lessons');
	const minutes = t('supervise.minutes');
	const classes = t('supervise.classes');
	const lastActive = t('supervise.last_active');

	return table(
		[t('supervise.teacher'), classes, lessons, minutes, lastActive],
		rows.map((r) =>
			m('tr', { key: r.uid }, [
				m(
					'th',
					{ scope: 'row' },
					m(
						m.route.Link,
						{
							href: `/supervise/teacher/${encodeURIComponent(schoolId)}/${encodeURIComponent(r.uid)}`,
						},
						r.name,
					),
				),
				cell(classes, String(r.classCount)),
				sparkCell(
					`${r.name}: ${lessons}`,
					r.lessonsByWeek.map((p) => ({ key: p.weekStart, value: p.value })),
					1,
					lessons,
				),
				sparkCell(
					`${r.name}: ${minutes}`,
					r.minutesByWeek.map((p) => ({ key: p.weekStart, value: p.value })),
					2,
					minutes,
				),
				cell(lastActive, date(r.lastLessonAt)),
			]),
		),
	);
}

/** Classes as cards — name, size, average score */
export function classCards(rows: SupervisorClassView[]): m.Children {
	if (rows.length === 0) return m('p.supervise__empty', t('supervise.no_classes'));

	return m(
		'.supervise__cards',
		rows.map((c) =>
			m(m.route.Link, { key: c.classId, href: `/supervise/class/${c.classId}`, class: 'card' }, [
				m('h3.supervise__card-title', c.name),
				m('p.supervise__card-meta', t('roster.title', { count: c.memberCount })),
				c.advancement
					? m(
							'p.supervise__card-meta',
							`${t('roster.avg_class_score')}: ${c.advancement.avgClassScore ?? '—'}`,
						)
					: null,
			]),
		),
	);
}

/** One teacher's classes: name, size, lessons, average, and the class score lesson by lesson */
export function classesTable(rows: SupervisorClassView[]): m.Children {
	if (rows.length === 0) return m('p.supervise__empty', t('supervise.no_classes'));
	const students = t('supervise.students');
	const lessons = t('supervise.lessons');
	const score = t('lesson.score');
	const trend = t('indicator.class.scorePerLesson');

	return table(
		[t('supervise.classes'), students, lessons, score, trend],
		rows.map((c) => {
			const scored = (c.aggregate?.perGame ?? []).filter((g) => g.classScoreTotal !== undefined);

			return m('tr', { key: c.classId }, [
				m(
					'th',
					{ scope: 'row' },
					m(m.route.Link, { href: `/supervise/class/${c.classId}` }, c.name),
				),
				cell(students, String(c.memberCount)),
				cell(lessons, String(c.aggregate?.gamesPlayed ?? c.advancement?.gamesPlayed ?? 0)),
				cell(score, String(c.advancement?.avgClassScore ?? c.aggregate?.avgClassScore ?? '—')),
				sparkCell(
					`${c.name}: ${trend}`,
					scored.map((g) => ({ key: dayKey(g.playedAt), value: g.classScoreTotal ?? 0 })),
					1,
					trend,
				),
			]);
		}),
	);
}

/** Lessons, newest first: when, which class, how long, how many, the score, how it ended */
export function lessonsTable(
	rows: AgoraTeacherLessonRow[],
	classNames: ReadonlyMap<string, string> = new Map(),
): m.Children {
	if (rows.length === 0) return m('p.supervise__empty', t('supervise.no_lessons'));
	const cls = t('lesson.class');
	const dur = t('lesson.duration');
	const participants = t('lesson.participants');
	const score = t('lesson.score');
	const outcome = t('lesson.outcome');

	return table(
		[t('lesson.date'), cls, dur, participants, score, outcome],
		rows
			.slice()
			.sort((a, b) => b.playedAt - a.playedAt)
			.map((r) =>
				m('tr', { key: r.sessionId }, [
					m('th', { scope: 'row' }, date(r.playedAt)),
					cell(cls, r.classId ? (classNames.get(r.classId) ?? '—') : t('startGame.guest_game')),
					cell(dur, duration(r.durationMs)),
					cell(participants, String(r.participantCount)),
					cell(score, r.classScoreTotal === undefined ? '—' : String(r.classScoreTotal)),
					cell(outcome, outcomePill(r.outcome)),
				]),
			),
	);
}

/** The same door TeacherHome shows an account that is not a teacher's */
export function signInPrompt(onSignedIn: () => void): m.Children {
	const { signInError } = getUserState();

	return m('.shell', [
		m(
			'.shell__content.text-center',
			{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
			[
				m('h2', t('supervise.title')),
				m('p.home-explanation', t('teacher.sign_in_required')),
				signInError
					? m(
							'p.home-explanation',
							{ role: 'alert' },
							t(
								signInError === 'popup-blocked'
									? 'teacher.sign_in_popup_blocked'
									: 'teacher.sign_in_failed',
							),
						)
					: null,
				m(
					'button.btn.btn--primary',
					{
						onclick: () => {
							signInWithGoogle()
								.then(onSignedIn)
								.catch((error: unknown) => {
									console.error('[Supervision]', { operation: 'supervise.signIn', error });
								});
						},
					},
					t('home.sign_in'),
				),
				m(
					'button.btn.btn--ghost',
					{ onclick: () => m.route.set('/teach') },
					t('supervise.back_to_teach'),
				),
			],
		),
	]);
}

/** "You supervise nothing here" — a sentence and a way back, never a redirect */
export function notSupervisor(): m.Children {
	return shell(
		t('supervise.title'),
		[
			m('p.supervise__notice', t('supervise.not_supervisor')),
			m(
				m.route.Link,
				{ href: '/teach', class: 'btn btn--secondary' },
				t('supervise.back_to_teach'),
			),
		],
		{ back: '/teach' },
	);
}

export interface ResourceOptions {
	/** What to say when the id points at nothing */
	notFoundKey: string;
	back?: string;
}

type Phase = 'loading' | 'ready' | 'signin' | 'denied' | 'missing' | 'failed';

/**
 * A screen that is one server answer: loads it once per instance, shows the
 * honest state in between, and never renders one account's answer to another.
 */
export function resource<T, A extends Record<string, string>>(
	fetcher: (attrs: A) => Promise<T>,
	render: (data: T, attrs: A) => m.Children,
	opts: ResourceOptions,
): m.Component<A> {
	let data: T | null = null;
	let phase: Phase = 'loading';
	let alive = true;
	let owner = '';

	async function load(attrs: A): Promise<void> {
		phase = 'loading';
		try {
			const user = await ensureUser();
			if (user.isAnonymous) {
				phase = 'signin';

				return;
			}
			owner = user.uid;
			const next = await fetcher(attrs);
			if (!alive || getUserState().user?.uid !== owner) return;
			data = next;
			phase = 'ready';
		} catch (error) {
			if (!alive) return;
			const text = String(error);
			phase = isDeniedError(error) ? 'denied' : text.includes('not-found') ? 'missing' : 'failed';
			if (phase === 'failed')
				console.error('[Supervision]', { operation: 'supervise.resource', error });
		} finally {
			if (alive) m.redraw();
		}
	}

	return {
		oninit: ({ attrs }) => {
			void load(attrs);
		},
		onremove: () => {
			alive = false;
		},
		view: ({ attrs }) => {
			if (phase === 'signin') return signInPrompt(() => void load(attrs));
			if (phase === 'denied') return notSupervisor();
			if (owner && owner !== getUserState().user?.uid) return notSupervisor();
			if (phase === 'ready' && data) return render(data, attrs);
			const back = opts.back ?? '/supervise';

			return shell(
				t('supervise.title'),
				phase === 'missing'
					? [
							m('p.supervise__notice', t(opts.notFoundKey)),
							m(m.route.Link, { href: back, class: 'btn btn--secondary' }, t('common.back')),
						]
					: phase === 'failed'
						? [
								m('p.supervise__notice', { role: 'alert' }, t('supervise.error')),
								m(
									'button.btn.btn--secondary',
									{ onclick: () => void load(attrs) },
									t('supervise.retry'),
								),
							]
						: m('p', { role: 'status' }, t('supervise.loading')),
				{ back },
			);
		},
	};
}
