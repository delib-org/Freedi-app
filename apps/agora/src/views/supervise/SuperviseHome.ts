import m from 'mithril';
import type { SupervisorSystemView } from '@freedi/shared-types';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { schoolContextFrom, systemContextFrom } from '../../lib/indicatorContexts';
import {
	fetchSupervisorOverview,
	fetchSupervisorSystem,
	isDeniedError,
	savedPeriod,
	savedScope,
	savePeriod,
	saveScope,
	type SupervisePeriod,
	type SuperviseScope,
	type SupervisorOverviewView,
} from '../../lib/supervisor';
import { ensureUser, getUserState } from '../../lib/user';
import { t } from '../../lib/i18n';
import {
	classCards,
	notSupervisor,
	periodToggle,
	privacy,
	section,
	shell,
	signInPrompt,
	teachersTable,
} from './shared';

type Phase = 'loading' | 'ready' | 'signin' | 'denied' | 'failed';

const ALL = '__all__';

/**
 * The supervisor's front page: one school at a time (or, for the system's
 * admin, every school at once), its teachers, its classes, and the period.
 */
export function SuperviseHome(): m.Component {
	let overview: SupervisorOverviewView | null = null;
	let system: SupervisorSystemView | null = null;
	let scope: SuperviseScope | null = null;
	let days: SupervisePeriod = savedPeriod();
	let uid = '';
	let phase: Phase = 'loading';
	let generation = 0;
	let selected = new Set<string>();
	let retriedScope = false;

	async function load(): Promise<void> {
		const seq = ++generation;
		phase = 'loading';
		system = null;
		m.redraw();
		try {
			const user = await ensureUser();
			if (user.isAnonymous) {
				phase = 'signin';

				return;
			}
			if (uid !== user.uid) {
				uid = user.uid;
				scope = savedScope(uid);
				selected = new Set();
			}
			const wantAll = scope !== null && 'all' in scope;
			const next = await fetchSupervisorOverview(
				scope && 'schoolId' in scope ? scope.schoolId : undefined,
				days,
			);
			if (seq !== generation || uid !== getUserState().user?.uid) return;
			overview = next;
			if (wantAll && next.role === 'sysadmin') {
				const result = await fetchSupervisorSystem(days);
				if (seq !== generation) return;
				system = result;
			} else if (next.school) {
				scope = { schoolId: next.school.schoolId };
			}
			phase = 'ready';
		} catch (error) {
			if (seq !== generation) return;
			// A remembered school this account no longer supervises: forget it
			// and let the server pick, once — the "denied" that remains is real.
			if (isDeniedError(error) && scope && !retriedScope) {
				retriedScope = true;
				scope = null;
				void load();

				return;
			}
			phase = isDeniedError(error) ? 'denied' : 'failed';
			if (phase === 'failed')
				console.error('[Supervision]', { operation: 'supervise.overview', error });
		} finally {
			if (seq === generation) m.redraw();
		}
	}

	function choose(next: SuperviseScope): void {
		scope = next;
		selected = new Set();
		saveScope(uid, next);
		void load();
	}

	function scopePicker(): m.Children {
		if (!overview) return null;
		const value = scope && 'all' in scope ? ALL : (scope?.schoolId ?? '');

		return m(
			'select.supervise__select',
			{
				'aria-label': t('supervise.pick_school'),
				value,
				onchange: (e: Event) => {
					const picked = (e.target as HTMLSelectElement).value;
					choose(picked === ALL ? { all: true } : { schoolId: picked });
				},
			},
			[
				overview.role === 'sysadmin' ? m('option', { value: ALL }, t('supervise.scope_all')) : null,
				...overview.schools.map((s) => m('option', { value: s.schoolId }, s.name)),
			],
		);
	}

	function teacherChips(teachers: Array<{ uid: string; name: string }>): m.Children {
		if (teachers.length < 2) return null;
		const chip = (label: string, pressed: boolean, onclick: () => void, key: string): m.Children =>
			m(
				'button.supervise__chip',
				{ key, type: 'button', 'aria-pressed': String(pressed), onclick },
				label,
			);

		return m('.supervise__chips', { role: 'group', 'aria-label': t('supervise.pick_teachers') }, [
			chip(
				t('supervise.all_teachers'),
				selected.size === 0,
				() => {
					selected = new Set();
				},
				ALL,
			),
			...teachers.map((r) =>
				chip(
					r.name,
					selected.has(r.uid),
					() => {
						if (selected.has(r.uid)) selected.delete(r.uid);
						else selected.add(r.uid);
					},
					r.uid,
				),
			),
		]);
	}

	function systemSection(view: SupervisorSystemView): m.Children {
		return section(t('supervise.system_title'), [
			m(IndicatorGrid<'system'>, { scope: 'system', context: systemContextFrom(view) }),
			m(
				'.supervise__cards',
				view.schools.map((s) =>
					m(
						'button.card',
						{ key: s.schoolId, type: 'button', onclick: () => choose({ schoolId: s.schoolId }) },
						[
							m('h3.supervise__card-title', s.name),
							m(
								'p.supervise__card-meta',
								`${t('supervise.teachers')}: ${s.teacherCount} · ${t('supervise.classes')}: ${s.classCount}`,
							),
						],
					),
				),
			),
		]);
	}

	function schoolSections(school: NonNullable<SupervisorOverviewView['school']>): m.Children {
		const teachers = school.teachers.filter((r) => selected.size === 0 || selected.has(r.uid));
		const classes = school.classes.filter(
			(c) => selected.size === 0 || c.teacherIds.some((id) => selected.has(id)),
		);

		return [
			school.truncated ? m('p.supervise__notice', t('supervise.truncated')) : null,
			m(IndicatorGrid<'school'>, { scope: 'school', context: schoolContextFrom(school) }),
			section(t('supervise.teachers'), [
				teacherChips(school.teachers),
				teachersTable(teachers, school.schoolId),
			]),
			section(t('supervise.classes'), classCards(classes)),
			privacy(),
		];
	}

	return {
		oninit: () => {
			void load();
		},
		onremove: () => {
			generation++;
		},
		view: () => {
			if (phase === 'signin') return signInPrompt(() => void load());
			if (phase === 'denied') return notSupervisor();
			if (uid && uid !== getUserState().user?.uid) return notSupervisor();

			return shell(
				t('supervise.title'),
				[
					m('.supervise__scope', [
						periodToggle(days, (d) => {
							days = d;
							savePeriod(d);
							void load();
						}),
					]),
					phase === 'loading' ? m('p', { role: 'status' }, t('supervise.loading')) : null,
					phase === 'failed'
						? [
								m('p.supervise__notice', { role: 'alert' }, t('supervise.error')),
								m(
									'button.btn.btn--secondary',
									{
										onclick: () => {
											scope = null;
											void load();
										},
									},
									t('supervise.retry'),
								),
							]
						: null,
					phase === 'ready' && system ? systemSection(system) : null,
					phase === 'ready' && !system && overview?.school ? schoolSections(overview.school) : null,
				],
				{
					back: '/teach',
					subtitle: system ? t('supervise.scope_all') : overview?.school?.name,
					trailing: scopePicker(),
				},
			);
		},
	};
}
