import m from 'mithril';
import { schoolContext, systemContext } from '@freedi/shared-charts';
import type { SupervisorOverview, SupervisorSystemView } from '@freedi/shared-types';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { supervisorConsole, savedScope, saveScope } from '../../lib/supervisor';
import { ensureUser, getUserState } from '../../lib/user';
import { t } from '../../lib/i18n';
import { shell, teachers, classes, periods, privacy } from './shared';

export function SuperviseHome(): m.Component {
	let overview: SupervisorOverview | null = null;
	let system: SupervisorSystemView | null = null;
	let schoolId = '';
	let uid = '';
	let days = 90;
	let pending = true;
	let denied = false;
	let failed = false;
	let generation = 0;
	let selected = new Set<string>();
	async function load(): Promise<void> {
		const seq = ++generation;
		pending = true;
		failed = false;
		system = null;
		overview = null;
		m.redraw();
		try {
			const user = await ensureUser();
			if (user.isAnonymous) {
				denied = true;

				return;
			}
			if (uid !== user.uid) {
				uid = user.uid;
				schoolId = savedScope(uid);
			}
			const next = await supervisorConsole({
				view: 'overview',
				...(schoolId && schoolId !== 'all' ? { schoolId } : {}),
				days,
			});
			if (seq !== generation || uid !== getUserState().user?.uid) return;
			overview = next;
			denied = false;
			if (schoolId === 'all' && next.role === 'sysadmin') {
				const result = await supervisorConsole({ view: 'system', days });
				if (seq === generation) system = result;
			} else schoolId = next.school?.schoolId ?? '';
		} catch (error) {
			if (seq === generation) {
				denied =
					String(error).includes('permission-denied') || String(error).includes('do not supervise');
				failed = !denied;
				console.error('[Supervision]', { operation: 'supervisor.overview', error });
			}
		} finally {
			if (seq === generation) {
				pending = false;
				m.redraw();
			}
		}
	}

	return {
		oninit: () => {
			void load();
		},
		onremove: () => {
			generation++;
		},
		view: () =>
			uid && uid !== getUserState().user?.uid
				? shell(t('supervise.title'), m('p', t('supervise.denied')))
				: shell(
						t('supervise.title'),
						[
							periods(days, (n) => {
								days = n;
								void load();
							}),
							overview
								? m('.supervise__controls', [
										m('label', [
											t('supervise.school'),
											m(
												'select',
												{
													value: schoolId,
													onchange: (e: Event) => {
														schoolId = (e.target as HTMLSelectElement).value;
														selected = new Set();
														saveScope(uid, schoolId);
														void load();
													},
												},
												[
													overview.role === 'sysadmin'
														? m('option', { value: 'all' }, t('supervise.allSchools'))
														: null,
													...overview.schools.map((s) =>
														m('option', { value: s.schoolId }, s.name),
													),
												],
											),
										]),
									])
								: null,
							pending
								? m('p', { role: 'status' }, t('supervise.loading'))
								: denied
									? m('p', t('supervise.denied'))
									: failed
										? [
												m('p', { role: 'alert' }, t('supervise.error')),
												m(
													'button.btn',
													{
														onclick: () => {
															schoolId = '';
															void load();
														},
													},
													t('supervise.retry'),
												),
											]
										: null,
							!pending && system
								? [
										m(IndicatorGrid<'system'>, { scope: 'system', context: systemContext(system) }),
										...system.schools.map((s) =>
											m(
												'button.card',
												{
													onclick: () => {
														schoolId = s.schoolId;
														saveScope(uid, schoolId);
														void load();
													},
												},
												s.name,
											),
										),
									]
								: null,
							!pending && !system && overview?.school
								? (() => {
										const s = overview.school;
										const filtered = s.teachers.filter(
											(r) => selected.size === 0 || selected.has(r.uid),
										);

										return [
											s.truncated ? m('p.supervise__notice', t('supervise.truncated')) : null,
											m(IndicatorGrid<'school'>, { scope: 'school', context: schoolContext(s) }),
											m('fieldset.supervise__controls', [
												m('legend', t('supervise.filterTeachers')),
												...s.teachers.map((r) =>
													m('label', [
														m('input', {
															type: 'checkbox',
															checked: selected.has(r.uid),
															onchange: () => {
																if (selected.has(r.uid)) selected.delete(r.uid);
																else selected.add(r.uid);
															},
														}),
														r.name,
													]),
												),
											]),
											teachers(filtered, s.schoolId),
											classes(
												s.classes.filter(
													(c) => selected.size === 0 || c.teacherIds.some((id) => selected.has(id)),
												),
											),
											privacy(),
										];
									})()
								: null,
						],
						'/teach',
					),
	};
}
